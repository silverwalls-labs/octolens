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
import { formatJson } from '../../src/output/index.ts';
import { replayFixture } from '../helpers/replay.ts';
import type { ScanResult } from '../../src/types/index.ts';

const FIXTURE_PATH = 'tests/fixtures/silverwalls-labs-review.json';

function noop() {
	/* intentional no-op */
}

function silentLogger() {
	return {
		debug: noop, info: noop, warn: noop, error: noop,
	};
}

let cachedResult: ScanResult | undefined;

async function getScanResult(): Promise<ScanResult> {
	if (cachedResult) {
		return cachedResult;
	}

	const fixture = replayFixture(FIXTURE_PATH);

	cachedResult = await scanRepo({
		repo: { owner: fixture.owner, name: fixture.repo },
		rules: [ ...allRules ],
		octokit: new Octokit({ auth: 'test', request: { retries: 0 } }),
		logger: silentLogger(),
		threshold: 'info',
	});

	return cachedResult;
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

test('produces expected findings for an unprotected public repo', findingsCase);

async function findingsCase() {
	const result = await getScanResult();

	assert.equal(result.summary.findingsTotal, 16);

	const ruleIds = result.findings.map((f) => f.ruleId).sort();

	assert.ok(ruleIds.includes('repo-config/branch-protection-required'));
	assert.ok(ruleIds.includes('repo-config/tag-protection'));
	assert.ok(ruleIds.includes('repo-config/license-file-present'));
	assert.ok(ruleIds.includes('repo-config/auto-delete-head-branches'));
	assert.ok(ruleIds.includes('repo-config/description-present'));
	assert.ok(ruleIds.includes('repo-config/topics-present'));
	assert.ok(ruleIds.includes('security/dependabot-security-updates-enabled'));
	assert.ok(ruleIds.includes('security/secret-scanning-enabled'));
	assert.ok(ruleIds.includes('security/secret-scanning-push-protection'));
	assert.ok(ruleIds.includes('security/code-scanning-enabled'));
	assert.ok(ruleIds.includes('security/security-policy-file'));
	assert.ok(ruleIds.includes('security/private-vulnerability-reporting'));
	assert.ok(ruleIds.includes('access/codeowners-file-present'));
	assert.ok(ruleIds.includes('access/team-based-admin'));
	assert.ok(ruleIds.includes('access/visibility-private-default'));
	assert.ok(ruleIds.includes('cicd/actions-allowlist'));
}

test('skips branch-protection-dependent rules', skippedCase);

async function skippedCase() {
	const result = await getScanResult();

	assert.equal(result.summary.rulesSkipped, 9);

	const skippedRuns = result.runs.filter((r) => r.status === 'skipped');
	const skippedIds = skippedRuns.map((r) => r.ruleId).sort();

	assert.deepEqual(skippedIds, [
		'repo-config/block-force-push',
		'repo-config/dismiss-stale-reviews',
		'repo-config/enforce-admins',
		'repo-config/require-approving-reviews',
		'repo-config/require-conversation-resolution',
		'repo-config/require-linear-history',
		'repo-config/require-pull-request',
		'repo-config/require-signed-commits',
		'repo-config/require-status-checks',
	]);

	for (const run of skippedRuns) {
		assert.equal(run.skipReason, 'default branch has no protection rule');
	}
}

test('reports zero errored rules', noErrorsCase);

async function noErrorsCase() {
	const result = await getScanResult();

	assert.equal(result.summary.rulesErrored, 0);
}

test('findings match expected severities', severitiesCase);

async function severitiesCase() {
	const result = await getScanResult();
	const bySeverity = result.summary.findingsBySeverity;

	assert.equal(bySeverity.critical, 1);
	assert.equal(bySeverity.high, 4);
	assert.equal(bySeverity.medium, 7);
	assert.equal(bySeverity.low, 1);
	assert.equal(bySeverity.info, 3);
}

test('summary counts are internally consistent', consistencyCase);

async function consistencyCase() {
	const result = await getScanResult();

	const okCount = result.runs.filter((r) => r.status === 'ok').length;
	const skipCount = result.runs.filter((r) => r.status === 'skipped').length;
	const errCount = result.runs.filter((r) => r.status === 'error').length;

	assert.equal(
		okCount + skipCount + errCount,
		result.summary.rulesRun,
	);
	assert.equal(skipCount, result.summary.rulesSkipped);
	assert.equal(errCount, result.summary.rulesErrored);

	const sevSum = Object.values(result.summary.findingsBySeverity)
		.reduce((a, b) => a + b, 0);

	assert.equal(sevSum, result.summary.findingsTotal);
}

test('JSON output matches expected structure', jsonOutputCase);

async function jsonOutputCase() {
	const result = await getScanResult();
	const json = formatJson(result);
	const parsed = JSON.parse(json) as ScanResult;

	assert.equal(parsed.schemaVersion, 1);
	assert.equal(parsed.target.owner, 'silverwalls-labs');
	assert.equal(parsed.target.name, 'review');
	assert.equal(parsed.findings.length, result.findings.length);
	assert.equal(parsed.runs.length, result.runs.length);
	assert.deepEqual(parsed.summary, result.summary);
}

test('exitCodeFor returns 1 for this repo', exitCodeCase);

async function exitCodeCase() {
	const result = await getScanResult();

	assert.equal(exitCodeFor(result), 1);
	assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
}
