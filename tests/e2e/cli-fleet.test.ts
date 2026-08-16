import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Octokit } from '@octokit/rest';
import { scanOrgAllRepos } from '../../src/engine/index.ts';
import { allRules, allOrgRules } from '../../src/rules/index.ts';
import { formatJson } from '../../src/output/index.ts';
import type { OrgScanReport } from '../../src/types/index.ts';

const token = process.env['OCTOLENS_E2E_TOKEN'] ??
	process.env['GITHUB_TOKEN'] ??
	process.env['OCTOLENS_TOKEN'];

const NO_TOKEN_SKIP = 'no OCTOLENS_E2E_TOKEN (or GITHUB_TOKEN/OCTOLENS_TOKEN)';

if (!token) {
	test('e2e fleet tests skipped', { skip: NO_TOKEN_SKIP }, noopTest);
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

async function scanFleet(): Promise<OrgScanReport> {
	return scanOrgAllRepos({
		org: 'silverwalls-labs',
		orgRules: [ ...allOrgRules ],
		repoRules: [ ...allRules ],
		octokit: new Octokit({ auth: token }),
		logger: silentLogger(),
		threshold: 'high',
		concurrency: 2,
	});
}

if (token) {
	test('fleet-scans a real organization', { timeout: 300_000 }, realFleetCase);
}

async function realFleetCase() {
	const report = await scanFleet();

	assert.equal(report.schemaVersion, 1);
	assert.deepEqual(report.target, { type: 'org-fleet', org: 'silverwalls-labs' });
	assert.equal(report.summary.listingComplete, true);
	assert.ok(report.summary.reposDiscovered >= 1);
	assert.equal(
		report.summary.reposScanned + report.summary.reposSkipped + report.summary.reposFailed,
		report.summary.reposDiscovered,
	);
	assert.ok(report.org.summary.rulesRun >= 20);

	for (const repo of report.repos) {
		assert.ok(repo.summary.rulesRun >= 40);
	}

	// The report is machine-parseable.
	const parsed = JSON.parse(formatJson(report)) as OrgScanReport;

	assert.equal(parsed.target.type, 'org-fleet');
}
