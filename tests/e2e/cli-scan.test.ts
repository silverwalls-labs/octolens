import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { Octokit } from '@octokit/rest';
import { scanRepo, exitCodeFor } from '../../src/engine/index.ts';
import { allRules } from '../../src/rules/index.ts';
import type { ScanResult } from '../../src/types/index.ts';

const token = process.env['OCTOLENS_E2E_TOKEN'] ??
	process.env['GITHUB_TOKEN'] ??
	process.env['OCTOLENS_TOKEN'];

const NO_TOKEN_SKIP = 'no OCTOLENS_E2E_TOKEN (or GITHUB_TOKEN/OCTOLENS_TOKEN)';

describe('e2e scan', () => {
	if (!token) {
		test('e2e tests skipped', { skip: NO_TOKEN_SKIP }, () => {
			/* placeholder */
		});

		return;
	}

	test('scans a real repo and produces valid JSON', { timeout: 60_000 }, async () => {
		const result = await scanReview();

		assert.equal(result.schemaVersion, 1);
		assert.equal(result.target.owner, 'silverwalls-labs');
		assert.equal(result.target.name, 'review');
		assert.ok(result.summary.rulesRun >= 40);
		assert.equal(result.summary.rulesErrored, 0);
	});

	test('reports branch-protection-required', { timeout: 60_000 }, async () => {
		const result = await scanReview();

		const ruleId = 'repo-config/branch-protection-required';
		const bpr = result.findings.find((f) => f.ruleId === ruleId);

		assert.ok(bpr, 'branch-protection-required finding expected');
		assert.equal(bpr.severity, 'critical');
	});

	test('skips branch-protection-dependent rules', { timeout: 60_000 }, async () => {
		const result = await scanReview();

		assert.ok(result.summary.rulesSkipped >= 10);

		const skippedRuns = result.runs.filter((r) => r.status === 'skipped');
		const reasons = new Set(skippedRuns.map((r) => r.skipReason));

		assert.ok(reasons.has('default branch has no protection rule'));
		assert.ok(reasons.has('no CODEOWNERS file present'));
	});

	test('exits 1 due to findings', { timeout: 60_000 }, async () => {
		const result = await scanReview();

		assert.equal(exitCodeFor(result), 1);
	});

	test('--severity critical filters findings', { timeout: 60_000 }, async () => {
		const result = await scanReview('critical');

		for (const f of result.findings) {
			assert.equal(f.severity, 'critical');
		}

		assert.equal(result.summary.findingsBySeverity.high, 0);
		assert.equal(result.summary.findingsBySeverity.medium, 0);
	});

	test('--fail-on-skip returns 1 at critical threshold', { timeout: 60_000 }, async () => {
		const result = await scanReview('critical');

		assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
	});

	test('scan with invalid repo produces errors', { timeout: 60_000 }, async () => {
		const result = await scanRepo({
			repo: {
				owner: 'nonexistent-owner-12345',
				name: 'nonexistent-repo-12345',
			},
			rules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'high',
		});

		assert.ok(result.summary.rulesErrored > 0);
	});

	test('scan counts match between runs and summary', { timeout: 60_000 }, async () => {
		const result = await scanReview();

		const okRuns = result.runs.filter((r) => r.status === 'ok').length;
		const skippedRuns = result.runs.filter((r) => r.status === 'skipped').length;
		const erroredRuns = result.runs.filter((r) => r.status === 'error').length;

		assert.equal(
			okRuns + skippedRuns + erroredRuns,
			result.summary.rulesRun,
		);
		assert.equal(skippedRuns, result.summary.rulesSkipped);
		assert.equal(erroredRuns, result.summary.rulesErrored);

		const totalFindings = result.runs.reduce(
			(sum, r) => sum + r.findings.length,
			0,
		);

		assert.ok(totalFindings >= result.summary.findingsTotal);
	});
});

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
