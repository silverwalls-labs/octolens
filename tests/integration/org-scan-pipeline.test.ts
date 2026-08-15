import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import {
	scanOrg,
	exitCodeFor,
} from '../../src/engine/index.ts';
import { allOrgRules } from '../../src/rules/index.ts';
import {
	formatJson,
	formatMarkdown,
	formatPretty,
} from '../../src/output/index.ts';
import {
	makeOrgActionsPermissionsResponse,
	makeOrgAllowedActionsResponse,
	makeOrgForkPrApprovalResponse,
	makeOrgHooksResponse,
	makeOrgPrivateForkPrResponse,
	makeOrgResponse,
	makeOrgWorkflowPermissionsResponse,
} from '../helpers/fixtures.ts';
import type { ScanResult } from '../../src/types/index.ts';

const BASE = 'https://api.github.com';
const ORG = 'silverwalls-labs';

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

function mockCompliantOrg(): void {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions`)
		.reply(200, makeOrgActionsPermissionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/workflow`)
		.reply(200, makeOrgWorkflowPermissionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/selected-actions`)
		.reply(200, makeOrgAllowedActionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-contributor-approval`)
		.reply(200, makeOrgForkPrApprovalResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-workflows-private-repos`)
		.reply(200, makeOrgPrivateForkPrResponse());
	nock(BASE).get(`/orgs/${ORG}/hooks`)
		.query({ per_page: '100' })
		.reply(200, makeOrgHooksResponse([]));
}

function mockNonCompliantOrg(): void {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse({
		twoFactorRequirementEnabled: false,
		defaultRepositoryPermission: 'write',
		membersCanCreatePublicRepositories: true,
		membersCanForkPrivateRepositories: true,
		membersCanChangeRepoVisibility: true,
		membersCanDeleteRepositories: true,
		membersCanInviteOutsideCollaborators: true,
		membersCanDeleteIssues: true,
		membersCanCreatePublicPages: true,
		webCommitSignoffRequired: false,
		deployKeysEnabledForRepositories: true,
		dependabotAlertsEnabledForNewRepositories: false,
		dependabotSecurityUpdatesEnabledForNewRepositories: false,
		secretScanningEnabledForNewRepositories: false,
		secretScanningPushProtectionEnabledForNewRepositories: false,
	}));
	nock(BASE).get(`/orgs/${ORG}/actions/permissions`)
		.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'all' }));
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/workflow`)
		.reply(200, makeOrgWorkflowPermissionsResponse({
			defaultWorkflowPermissions: 'write',
			canApprovePullRequestReviews: true,
		}));
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-contributor-approval`)
		.reply(200, makeOrgForkPrApprovalResponse('first_time_contributors_new_to_github'));
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-workflows-private-repos`)
		.reply(200, makeOrgPrivateForkPrResponse({
			runWorkflowsFromForkPullRequests: true,
			sendWriteTokensToWorkflows: true,
			sendSecretsAndVariables: true,
			requireApprovalForForkPrWorkflows: false,
		}));
	nock(BASE).get(`/orgs/${ORG}/hooks`)
		.query({ per_page: '100' })
		.reply(200, makeOrgHooksResponse([ { id: 1, url: 'http://example.com/hook' } ]));
}

function mockNonAdminOrg(): void {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse({ privileged: false }));
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs\/(actions|hooks)/)
		.reply(403, { message: 'Must have admin rights' });
}

async function runFullOrgScan(): Promise<ScanResult> {
	return scanOrg({
		org: ORG,
		rules: [ ...allOrgRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
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

test('full org scan with all rules produces valid results', fullScanCase);

async function fullScanCase() {
	mockCompliantOrg();

	const result = await runFullOrgScan();

	assert.equal(result.schemaVersion, 1);
	assert.deepEqual(result.target, { type: 'org', org: ORG });
	assert.equal(result.summary.rulesRun, allOrgRules.length);
	assert.equal(result.summary.rulesErrored, 0);
	assert.equal(result.summary.rulesSkipped, 0);
	assert.equal(result.summary.findingsTotal, 0);
	assert.equal(exitCodeFor(result), 0);
}

test('non-compliant org flags every rule', nonCompliantCase);

async function nonCompliantCase() {
	mockNonCompliantOrg();

	const result = await scanOrg({
		org: ORG,
		rules: [ ...allOrgRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'info',
	});

	/*
	 * -1: with allowed_actions 'all', org/actions-allowlist flags but
	 * org/actions-allowlist-pinned is not applicable (no allowlist to pin).
	 */
	assert.equal(result.summary.rulesRun, allOrgRules.length);
	assert.equal(result.summary.findingsTotal, allOrgRules.length - 1);
	assert.equal(exitCodeFor(result), 1);

	for (const finding of result.findings) {
		assert.equal(finding.org, ORG);
		assert.equal(finding.repo, undefined);
	}
}

test('non-admin token skips every rule instead of passing', nonAdminCase);

async function nonAdminCase() {
	mockNonAdminOrg();

	const result = await runFullOrgScan();

	assert.equal(result.summary.rulesRun, allOrgRules.length);
	assert.equal(result.summary.rulesSkipped, allOrgRules.length);
	assert.equal(result.summary.findingsTotal, 0);
	assert.equal(exitCodeFor(result), 0);
	assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
}

test('rate-limit 403 on an org endpoint errors instead of skipping', rateLimitCase);

async function rateLimitCase() {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse());
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs\/actions/)
		.reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });
	nock(BASE).get(`/orgs/${ORG}/hooks`)
		.query({ per_page: '100' })
		.reply(200, makeOrgHooksResponse([]));

	const result = await runFullOrgScan();
	const actionRuleIds = [
		'org/actions-allowlist',
		'org/default-workflow-permissions-read',
		'org/forbid-workflow-pr-approval',
	];
	const actionRuns = result.runs.filter((r) => actionRuleIds.includes(r.ruleId));

	assert.equal(actionRuns.length, 3);
	for (const run of actionRuns) {
		assert.equal(run.status, 'error');
	}
}

test('500 from all endpoints produces errored rules, not a crash', serverErrorCase);

async function serverErrorCase() {
	nock(BASE).persist().get(/.*/)
		.reply(500, { message: 'Internal Server Error' });

	const result = await runFullOrgScan();

	assert.equal(result.summary.rulesRun, allOrgRules.length);
	assert.equal(result.summary.rulesErrored, allOrgRules.length);
}

test('markdown output renders the org header and findings', markdownCase);

async function markdownCase() {
	mockNonCompliantOrg();

	const result = await runFullOrgScan();
	const md = formatMarkdown(result);

	assert.match(md, /^# Octolens scan — silverwalls-labs/);
	assert.match(md, /`org\/two-factor-required` · silverwalls-labs/);
	assert.doesNotMatch(md, /undefined/);
}

test('pretty output renders the org header and findings', prettyCase);

async function prettyCase() {
	mockNonCompliantOrg();

	const result = await runFullOrgScan();
	const pretty = formatPretty(result, { color: false });

	assert.match(pretty, /Octolens scan — silverwalls-labs/);
	assert.match(pretty, /passed .* flagged .* skipped/);
	assert.doesNotMatch(pretty, /undefined/);
}

test('JSON output round-trips and findings carry org, not repo', jsonRoundtripCase);

async function jsonRoundtripCase() {
	mockNonCompliantOrg();

	const result = await runFullOrgScan();
	const parsed = JSON.parse(formatJson(result)) as ScanResult;

	assert.deepEqual(parsed.target, { type: 'org', org: ORG });
	assert.equal(parsed.findings.length, result.findings.length);
	for (const finding of parsed.findings) {
		assert.equal(finding.org, ORG);
		assert.equal('repo' in finding, false);
	}
}
