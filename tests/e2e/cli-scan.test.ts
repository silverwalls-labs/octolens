import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Octokit } from '@octokit/rest';
import { scanRepo, exitCodeFor } from '../../src/engine/index.ts';
import { allRules } from '../../src/rules/index.ts';
import type { ScanResult } from '../../src/types/index.ts';

const token = process.env['GITHUB_TOKEN'] ?? process.env['OCTOLENS_TOKEN'];

if (!token) {
	test('e2e tests skipped', { skip: 'no GITHUB_TOKEN or OCTOLENS_TOKEN' }, noopTest);
}

function noopTest() {
	/* placeholder */
}

function noop() {
	/* intentional no-op */
}

function silentLogger() {
	return {
		debug: noop, info: noop, warn: noop, error: noop,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: token });
}

async function scanReview(threshold = 'high' as const): Promise<ScanResult> {
	return scanRepo({
		repo: { owner: 'silverwalls-labs', name: 'review' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold,
	});
}

if (token) {
	test('scans a real repo and validates full results', { timeout: 60_000 }, realScanCase);
	test('--severity critical filters findings', { timeout: 60_000 }, severityCase);
	test('scan with invalid repo produces errors', { timeout: 60_000 }, invalidRepoCase);
}

async function realScanCase() {
	const result = await scanReview();

	assert.equal(result.schemaVersion, 1);
	assert.equal(result.target.owner, 'silverwalls-labs');
	assert.equal(result.target.name, 'review');
	assert.ok(result.summary.rulesRun >= 40);
	assert.equal(exitCodeFor(result), 1);

	const bpr = result.findings.find((f) => f.ruleId === 'repo-config/branch-protection-required');

	assert.ok(bpr, 'branch-protection-required finding expected');
	assert.equal(bpr.severity, 'critical');

	assert.ok(result.summary.rulesSkipped >= 9);

	const skippedRuns = result.runs.filter((r) => r.status === 'skipped');

	for (const run of skippedRuns) {
		assert.equal(run.skipReason, 'default branch has no protection rule');
	}
}

async function severityCase() {
	const result = await scanReview('critical');

	for (const f of result.findings) {
		assert.equal(f.severity, 'critical');
	}

	assert.equal(result.summary.findingsBySeverity.high, 0);
	assert.equal(result.summary.findingsBySeverity.medium, 0);
}

async function invalidRepoCase() {
	const result = await scanRepo({
		repo: { owner: 'nonexistent-owner-12345', name: 'nonexistent-repo-12345' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.ok(result.summary.rulesErrored > 0);
}
