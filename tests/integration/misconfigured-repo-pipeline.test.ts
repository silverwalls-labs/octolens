import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { scanRepo, exitCodeFor } from '../../src/engine/index.ts';
import { allRules } from '../../src/rules/index.ts';
import { formatMarkdown, formatPretty } from '../../src/output/index.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';
import type { ScanResult } from '../../src/types/index.ts';

const BASE = 'https://api.github.com';
const REPO_PATH = '/repos/sheplu/Octolens';

function noop() {
	/* intentional no-op */
}

function silentLogger() {
	return {
		debug: noop, info: noop, warn: noop, error: noop,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: 'test-token', request: { retries: 0 } });
}

function isoDaysAgo(days: number): string {
	return new Date(Date.now() - (days * 24 * 60 * 60 * 1000)).toISOString();
}

/**
 * A public repository where every data-driven rule sees its worst case:
 * too many admins, plain-HTTP webhooks, stale unscoped secrets, an
 * unprotected environment, writable deploy keys, broken CODEOWNERS,
 * workflow PR approval, self-hosted runners, and a missing required
 * custom property.
 */
function mockMisconfiguredRepo(): void {
	nock(BASE).get(REPO_PATH).reply(200, makeRepoResponse());
	nock(BASE)
		.get(`${REPO_PATH}/branches/main/protection`)
		.reply(404, { message: 'Branch not protected' });

	nock(BASE)
		.get(`${REPO_PATH}/collaborators`)
		.query({ affiliation: 'direct', per_page: '100' })
		.reply(200, [
			{ login: 'a', role_name: 'admin' },
			{ login: 'b', role_name: 'admin' },
			{ login: 'c', role_name: 'admin' },
			{ login: 'd', role_name: 'admin' },
		]);
	nock(BASE)
		.get(`${REPO_PATH}/collaborators`)
		.query({ affiliation: 'outside', per_page: '100' })
		.reply(200, [ { login: 'contractor', role_name: 'write' } ]);
	nock(BASE)
		.get(`${REPO_PATH}/teams`)
		.query(true)
		.reply(200, [
			{
				slug: 'devs', name: 'Devs', permission: 'push',
			},
		]);

	nock(BASE)
		.get(`${REPO_PATH}/hooks`)
		.query(true)
		.reply(200, [ { id: 1, config: { url: 'http://ci.example.com/hook', insecure_ssl: '1' } } ]);
	nock(BASE)
		.get(`${REPO_PATH}/keys`)
		.query(true)
		.reply(200, [
			{
				id: 1, title: 'legacy-deploy', read_only: false,
			},
		]);
	nock(BASE)
		.get(`${REPO_PATH}/codeowners/errors`)
		.reply(200, { errors: [ { kind: 'Unknown owner', line: 1 } ] });

	nock(BASE)
		.get(`${REPO_PATH}/actions/secrets`)
		.query({ per_page: '100' })
		.reply(200, {
			total_count: 1,
			secrets: [
				{
					name: 'OLD_CLOUD_KEY',
					created_at: isoDaysAgo(400),
					updated_at: isoDaysAgo(200),
				},
			],
		});
	nock(BASE)
		.get(`${REPO_PATH}/dependabot/secrets`)
		.query({ per_page: '100' })
		.reply(200, { total_count: 0, secrets: [] });
	nock(BASE)
		.get(`${REPO_PATH}/codespaces/secrets`)
		.query({ per_page: '100' })
		.reply(200, { total_count: 0, secrets: [] });

	nock(BASE)
		.get(`${REPO_PATH}/environments`)
		.query(true)
		.reply(200, {
			total_count: 1,
			environments: [
				{
					name: 'production',
					protection_rules: [],
					deployment_branch_policy: null,
				},
			],
		});
	nock(BASE)
		.get(`${REPO_PATH}/actions/permissions/workflow`)
		.reply(200, {
			default_workflow_permissions: 'write',
			can_approve_pull_request_reviews: true,
		});
	nock(BASE)
		.get(`${REPO_PATH}/actions/runners`)
		.query(true)
		.reply(200, {
			total_count: 1,
			runners: [
				{
					id: 1, name: 'shed-mac-mini', labels: [ { name: 'self-hosted' } ],
				},
			],
		});

	nock(BASE)
		.get('/orgs/sheplu/properties/schema')
		.reply(200, [ { property_name: 'team', required: true } ]);
	nock(BASE)
		.get(`${REPO_PATH}/properties/values`)
		.reply(200, []);

	// Everything else stays quiet so unrelated rules take their pass paths.
	nock(BASE).persist().get(new RegExp(`${REPO_PATH}/`))
		.reply(200, []);
	nock(BASE).persist().head(new RegExp(`${REPO_PATH}/`))
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

async function runMisconfiguredScan(): Promise<ScanResult> {
	return scanRepo({
		repo: { owner: 'sheplu', name: 'Octolens' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'info',
	});
}

beforeEach(setupCase);

function setupCase() {
	nock.disableNetConnect();
}

afterEach(teardownCase);

function teardownCase() {
	nock.cleanAll();
	nock.enableNetConnect();
}

const EXPECTED_FINDINGS = [
	'access/admin-count',
	'access/outside-collaborator-count',
	'access/team-based-admin',
	'access/webhooks-use-https',
	'access/deploy-keys-readonly',
	'access/codeowners-valid',
	'access/required-custom-properties',
	'access/visibility-private-default',
	'security/secrets-rotation',
	'security/scope-secrets-to-environments',
	'repo-config/environment-protection',
	'repo-config/branch-protection-required',
	'cicd/forbid-workflow-pr-approval',
	'cicd/default-workflow-permissions-read',
	'cicd/forbid-self-hosted-runners-on-public-repos',
];

test('a misconfigured repository triggers every data-driven finding path', misconfiguredCase);

async function misconfiguredCase() {
	mockMisconfiguredRepo();

	const result = await runMisconfiguredScan();
	const flagged = new Set(result.findings.map((f) => f.ruleId));

	for (const ruleId of EXPECTED_FINDINGS) {
		assert.ok(flagged.has(ruleId), `expected a finding from ${ruleId}`);
	}

	assert.equal(result.summary.rulesErrored, 0);
	assert.equal(exitCodeFor(result), 1);
}

test('the misconfigured scan renders in markdown and pretty output', misconfiguredRendering);

async function misconfiguredRendering() {
	mockMisconfiguredRepo();

	const result = await runMisconfiguredScan();

	const md = formatMarkdown(result);

	assert.match(md, /# Octolens/);
	assert.match(md, /admin/i);
	assert.doesNotMatch(md, /undefined/);

	const pretty = formatPretty(result, { color: false });

	assert.match(pretty, /sheplu\/Octolens/);
	assert.doesNotMatch(pretty, /undefined/);

	const colored = formatPretty(result, { color: true });

	assert.match(colored, /MEDIUM|LOW|INFO/);
}

test('a private repository allowing forks is flagged', privateForkingCase);

async function privateForkingCase() {
	nock(BASE).get(REPO_PATH).reply(200, makeRepoResponse({
		visibility: 'private',
		allowForking: true,
	}));
	nock(BASE)
		.get(`${REPO_PATH}/branches/main/protection`)
		.reply(404, { message: 'Branch not protected' });
	nock(BASE).persist().get(new RegExp(`${REPO_PATH}/`))
		.reply(200, []);
	nock(BASE).persist().head(new RegExp(`${REPO_PATH}/`))
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });

	const result = await runMisconfiguredScan();
	const flagged = new Set(result.findings.map((f) => f.ruleId));

	assert.ok(flagged.has('repo-config/forbid-forking-private-repos'));
	assert.ok(!flagged.has('access/visibility-private-default'));
}
