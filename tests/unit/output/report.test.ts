import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPrettyReport } from '../../../src/output/pretty.ts';
import { formatMarkdownReport } from '../../../src/output/markdown.ts';
import { formatJson } from '../../../src/output/json.ts';
import type {
	Finding, OrgScanReport, ScanResult, Severity,
} from '../../../src/types/index.ts';

const ORG = 'silverwalls-labs';

function makeRepoResult(name: string, findings: Finding[]): ScanResult {
	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: ORG, name,
		},
		threshold: 'high',
		runs: [
			{
				ruleId: 'repo-config/branch-protection-required',
				status: 'ok',
				findings,
				durationMs: 1,
			},
		],
		findings,
		summary: {
			rulesRun: 1,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: findings.length,
			findingsBySeverity: countBySeverity(findings),
		},
	};
}

function makeOrgResult(findings: Finding[]): ScanResult {
	return {
		schemaVersion: 1,
		target: { type: 'org', org: ORG },
		threshold: 'high',
		runs: [
			{
				ruleId: 'org/two-factor-required',
				status: 'ok',
				findings,
				durationMs: 1,
			},
		],
		findings,
		summary: {
			rulesRun: 1,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: findings.length,
			findingsBySeverity: countBySeverity(findings),
		},
	};
}

function countBySeverity(findings: Finding[]): Record<Severity, number> {
	const counts: Record<Severity, number> = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const f of findings) {
		counts[f.severity]++;
	}

	return counts;
}

const ORG_FINDING: Finding = {
	ruleId: 'org/two-factor-required',
	severity: 'critical',
	org: ORG,
	title: 'Two-factor authentication is not required',
};

const REPO_FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'high',
	repo: { owner: ORG, name: 'flagged-repo' },
	title: 'Default branch is not protected',
};

function makeReport(overrides: Partial<OrgScanReport> = {}): OrgScanReport {
	const org = makeOrgResult([ ORG_FINDING ]);
	const repos = [
		makeRepoResult('clean-repo', []),
		makeRepoResult('flagged-repo', [ REPO_FINDING ]),
	];

	return {
		schemaVersion: 1,
		target: { type: 'org-fleet', org: ORG },
		threshold: 'high',
		org,
		repos,
		skipped: [ { repo: { owner: ORG, name: 'old-repo' }, reason: 'archived' } ],
		failures: [ { repo: { owner: ORG, name: 'broken-repo' }, error: 'boom' } ],
		summary: {
			reposDiscovered: 4,
			reposScanned: 2,
			reposSkipped: 1,
			reposFailed: 1,
			listingComplete: true,
			rulesRun: 3,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: 2,
			findingsBySeverity: {
				critical: 1,
				high: 1,
				medium: 0,
				low: 0,
				info: 0,
			},
		},
		...overrides,
	};
}

test('pretty report shows org, repos, failures, skips, and summary', prettyReportSections);

function prettyReportSections() {
	const out = formatPrettyReport(makeReport(), { color: false });

	assert.match(out, /Octolens scan — silverwalls-labs \(organization \+ 2 repositories\)/);
	assert.match(out, /Organization posture/);
	assert.match(out, /Two-factor authentication is not required/);
	assert.match(out, /Repositories \(2 scanned\)/);
	assert.match(out, /Default branch is not protected/);
	assert.match(out, /1 repositories with no findings/);
	assert.match(out, /Failed repositories \(1\)/);
	assert.match(out, /broken-repo: boom/);
	assert.match(out, /Skipped: 1 archived/);
	assert.match(out, /Repositories: 2 scanned · 1 skipped · 1 failed/);
	assert.match(out, /Findings \(>= high\): 2/);
}

test('pretty report warns when the listing is incomplete', prettyReportTruncated);

function prettyReportTruncated() {
	const report = makeReport();

	report.summary.listingComplete = false;
	const out = formatPrettyReport(report, { color: false });

	assert.match(out, /Repository listing incomplete/);
}

test('markdown report renders all sections', markdownReportSections);

function markdownReportSections() {
	const out = formatMarkdownReport(makeReport());

	assert.match(out, /^# Octolens scan — silverwalls-labs \(organization fleet\)/);
	assert.match(out, /## Organization posture/);
	assert.match(out, /## Repositories \(2 scanned, 1 skipped, 1 failed\)/);
	assert.match(out, /### High — Default branch is not protected/);
	assert.match(out, /## Failed repositories \(1\)/);
	assert.match(out, /\| `silverwalls-labs\/broken-repo` \| boom \|/);
	assert.match(out, /## Skipped repositories \(1\)/);
	assert.match(out, /\| `silverwalls-labs\/old-repo` \| archived \|/);
}

test('json report round-trips with the org-fleet target', jsonReportRoundTrip);

function jsonReportRoundTrip() {
	const report = makeReport();
	const parsed = JSON.parse(formatJson(report)) as OrgScanReport;

	assert.equal(parsed.schemaVersion, 1);
	assert.deepEqual(parsed.target, { type: 'org-fleet', org: ORG });
	assert.equal(parsed.repos.length, 2);
	assert.equal(parsed.summary.findingsTotal, 2);
}
