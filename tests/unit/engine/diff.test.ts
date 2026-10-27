import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	fingerprint, diffFindings, filterScanResult, filterOrgScanReport,
} from '../../../src/engine/diff.ts';
import type {
	Finding, FleetSummary, OrgScanReport, RuleRun, ScanResult, ScanSummary,
} from '../../../src/types/index.ts';

const REPO_FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'high',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'Enable branch protection for the default branch',
};

const ORG_FINDING: Finding = {
	ruleId: 'org/two-factor-required',
	severity: 'critical',
	org: 'silverwalls-labs',
	title: 'Require 2FA for all organization members',
};

describe('fingerprint', () => {
	test('repo finding produces ruleId:owner/name:title', () => {
		const expected =
			'repo-config/branch-protection-required:' +
			'sheplu/editorconfig:' +
			'Enable branch protection for the default branch';

		assert.equal(fingerprint(REPO_FINDING), expected);
	});

	test('org finding produces ruleId:orgLogin:title', () => {
		assert.equal(
			fingerprint(ORG_FINDING),
			'org/two-factor-required:silverwalls-labs:Require 2FA for all organization members',
		);
	});

	test('finding with no repo or org produces ruleId::title', () => {
		const finding: Finding = {
			ruleId: 'test/rule',
			severity: 'info',
			title: 'test',
		};

		assert.equal(fingerprint(finding), 'test/rule::test');
	});

	test('severity and detail do not affect the fingerprint', () => {
		const a: Finding = {
			...REPO_FINDING, severity: 'high', detail: 'foo',
		};
		const b: Finding = {
			...REPO_FINDING, severity: 'low', detail: 'bar',
		};

		assert.equal(fingerprint(a), fingerprint(b));
	});
});

describe('diffFindings', () => {
	test('empty baseline: all current findings are new', () => {
		const { added, summary } = diffFindings([], [ REPO_FINDING, ORG_FINDING ]);

		assert.deepEqual(added, [ REPO_FINDING, ORG_FINDING ]);
		assert.deepEqual(summary, {
			added: 2, removed: 0, unchanged: 0,
		});
	});

	test('empty current: all baseline findings are removed', () => {
		const { added, summary } = diffFindings([ REPO_FINDING, ORG_FINDING ], []);

		assert.deepEqual(added, []);
		assert.deepEqual(summary, {
			added: 0, removed: 2, unchanged: 0,
		});
	});

	test('both empty: nothing changed', () => {
		const { added, summary } = diffFindings([], []);

		assert.deepEqual(added, []);
		assert.deepEqual(summary, {
			added: 0, removed: 0, unchanged: 0,
		});
	});

	test('identical findings: zero new, zero removed', () => {
		const baseline = [ REPO_FINDING, ORG_FINDING ];
		const current = [ { ...REPO_FINDING }, { ...ORG_FINDING } ];
		const { added, summary } = diffFindings(baseline, current);

		assert.deepEqual(added, []);
		assert.deepEqual(summary, {
			added: 0, removed: 0, unchanged: 2,
		});
	});

	test('disjoint findings: all new, all removed', () => {
		const { added, summary } = diffFindings([ REPO_FINDING ], [ ORG_FINDING ]);

		assert.deepEqual(added, [ ORG_FINDING ]);
		assert.deepEqual(summary, {
			added: 1, removed: 1, unchanged: 0,
		});
	});

	test('mixed: some new, some removed, some unchanged', () => {
		const unchanged: Finding = {
			ruleId: 'security/secret-scanning-enabled',
			severity: 'high',
			repo: { owner: 'sheplu', name: 'editorconfig' },
			title: 'Enable secret scanning',
		};
		const removed: Finding = {
			ruleId: 'repo-config/license-file-present',
			severity: 'medium',
			repo: { owner: 'sheplu', name: 'editorconfig' },
			title: 'Add a LICENSE file',
		};
		const added: Finding = {
			ruleId: 'cicd/actions-permissions-minimal',
			severity: 'high',
			repo: { owner: 'sheplu', name: 'editorconfig' },
			title: 'Restrict Actions permissions',
		};

		const baseline = [ unchanged, removed ];
		const current = [ unchanged, added ];
		const result = diffFindings(baseline, current);

		assert.deepEqual(result.added, [ added ]);
		assert.deepEqual(result.summary, {
			added: 1, removed: 1, unchanged: 1,
		});
	});

	test('duplicate fingerprints: counts consumed correctly', () => {
		const dup = { ...REPO_FINDING };

		// Baseline has 3 copies, current has 2 → 0 new, 1 removed
		const { added, summary } = diffFindings(
			[
				dup,
				dup,
				dup,
			],
			[ dup, dup ],
		);

		assert.deepEqual(added, []);
		assert.deepEqual(summary, {
			added: 0, removed: 1, unchanged: 2,
		});
	});

	test('duplicate fingerprints: current has more than baseline', () => {
		const dup = { ...REPO_FINDING };

		// Baseline has 2, current has 4 → 2 new, 0 removed
		const { added, summary } = diffFindings(
			[ dup, dup ],
			[
				dup,
				dup,
				dup,
				dup,
			],
		);

		assert.equal(added.length, 2);
		assert.deepEqual(summary, {
			added: 2, removed: 0, unchanged: 2,
		});
	});

	test('severity change does not make a finding new', () => {
		const baselined: Finding = { ...REPO_FINDING, severity: 'medium' };
		const current: Finding = { ...REPO_FINDING, severity: 'critical' };
		const { added, summary } = diffFindings([ baselined ], [ current ]);

		assert.deepEqual(added, []);
		assert.deepEqual(summary, {
			added: 0, removed: 0, unchanged: 1,
		});
	});

	test('added findings are the same objects from current', () => {
		const newFinding: Finding = {
			ruleId: 'test/new',
			severity: 'info',
			repo: { owner: 'a', name: 'b' },
			title: 'new finding',
		};

		const { added } = diffFindings([], [ newFinding ]);

		assert.strictEqual(added[0], newFinding);
	});
});

describe('filterScanResult', () => {
	test('keeps only the specified findings and recomputes summary', () => {
		const kept = REPO_FINDING;
		const dropped: Finding = {
			ruleId: 'security/secret-scanning-enabled',
			severity: 'medium',
			repo: { owner: 'sheplu', name: 'editorconfig' },
			title: 'Enable secret scanning',
		};

		const run: RuleRun = {
			ruleId: REPO_FINDING.ruleId,
			status: 'ok',
			findings: [ kept ],
			durationMs: 10,
		};
		const run2: RuleRun = {
			ruleId: dropped.ruleId,
			status: 'ok',
			findings: [ dropped ],
			durationMs: 5,
		};

		const result = makeResult([ kept, dropped ], [ run, run2 ]);
		const filtered = filterScanResult(result, [ kept ]);

		assert.deepEqual(filtered.findings, [ kept ]);
		assert.equal(filtered.summary.findingsTotal, 1);
		assert.equal(filtered.summary.findingsBySeverity.high, 1);
		assert.equal(filtered.summary.findingsBySeverity.medium, 0);
	});

	test('filters run findings by object identity', () => {
		const run: RuleRun = {
			ruleId: REPO_FINDING.ruleId,
			status: 'ok',
			findings: [ REPO_FINDING ],
			durationMs: 10,
		};

		const result = makeResult([ REPO_FINDING ], [ run ]);
		const filtered = filterScanResult(result, []);

		assert.deepEqual(filtered.runs[0].findings, []);
		assert.deepEqual(filtered.findings, []);
		assert.equal(filtered.summary.findingsTotal, 0);
	});

	test('preserves schemaVersion, target, and threshold', () => {
		const result = makeResult([ REPO_FINDING ], []);
		const filtered = filterScanResult(result, []);

		assert.equal(filtered.schemaVersion, 1);
		assert.deepEqual(filtered.target, result.target);
		assert.equal(filtered.threshold, result.threshold);
	});

	test('preserves run execution metadata', () => {
		const run: RuleRun = {
			ruleId: 'test/rule',
			status: 'error',
			findings: [],
			error: 'boom',
			durationMs: 42,
		};

		const result = makeResult([], [ run ]);
		const filtered = filterScanResult(result, []);

		assert.equal(filtered.runs[0].status, 'error');
		assert.equal(filtered.runs[0].error, 'boom');
		assert.equal(filtered.runs[0].durationMs, 42);
	});
});

describe('filterOrgScanReport', () => {
	test('distributes findings to correct sub-results', () => {
		const orgFinding: Finding = {
			...ORG_FINDING,
		};
		const repoFinding: Finding = {
			...REPO_FINDING,
		};

		const orgResult = makeResult([ orgFinding ], [], 'org');
		const repoResult = makeResult([ repoFinding ], [], 'repo');
		const report = makeReport(orgResult, [ repoResult ]);

		// Keep only the org finding
		const filtered = filterOrgScanReport(report, [ orgFinding ]);

		assert.deepEqual(filtered.org.findings, [ orgFinding ]);
		assert.equal(filtered.org.summary.findingsTotal, 1);
		assert.deepEqual(filtered.repos[0].findings, []);
		assert.equal(filtered.repos[0].summary.findingsTotal, 0);
		assert.equal(filtered.summary.findingsTotal, 1);
	});

	test('fleet summary severity counts are recomputed', () => {
		const highFinding: Finding = {
			...REPO_FINDING,
			severity: 'high',
		};
		const critFinding: Finding = {
			...ORG_FINDING,
			severity: 'critical',
		};

		const orgResult = makeResult([ critFinding ], [], 'org');
		const repoResult = makeResult([ highFinding ], [], 'repo');
		const report = makeReport(orgResult, [ repoResult ]);

		const filtered = filterOrgScanReport(report, [ highFinding ]);

		assert.equal(filtered.summary.findingsBySeverity.high, 1);
		assert.equal(filtered.summary.findingsBySeverity.critical, 0);
		assert.equal(filtered.summary.findingsTotal, 1);
	});

	test('preserves skipped, failures, and listingComplete', () => {
		const orgResult = makeResult([], [], 'org');
		const report: OrgScanReport = {
			...makeReport(orgResult, []),
			skipped: [ { repo: { owner: 'a', name: 'b' }, reason: 'archived' } ],
			failures: [ { repo: { owner: 'c', name: 'd' }, error: 'boom' } ],
			summary: {
				...makeReport(orgResult, []).summary,
				listingComplete: false,
			},
		};

		const filtered = filterOrgScanReport(report, []);

		assert.equal(filtered.skipped.length, 1);
		assert.equal(filtered.failures.length, 1);
		assert.equal(filtered.summary.listingComplete, false);
	});
});

function makeResult(
	findings: Finding[],
	runs: RuleRun[],
	targetType: 'repo' | 'org' = 'repo',
): ScanResult {
	const findingsBySeverity = {
		critical: 0, high: 0, medium: 0, low: 0, info: 0,
	};

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	const summary: ScanSummary = {
		rulesRun: runs.length,
		rulesErrored: 0,
		rulesSkipped: 0,
		findingsTotal: findings.length,
		findingsBySeverity,
	};

	const target = targetType === 'repo' ?
		{
			type: 'repo' as const, owner: 'sheplu', name: 'editorconfig',
		} :
		{ type: 'org' as const, org: 'silverwalls-labs' };

	return {
		schemaVersion: 1,
		target,
		threshold: 'high',
		runs,
		findings,
		summary,
	};
}

function makeReport(org: ScanResult, repos: ScanResult[]): OrgScanReport {
	const allFindings = org.findings.length +
		repos.reduce((sum, r) => sum + r.findings.length, 0);

	const findingsBySeverity = {
		critical: 0, high: 0, medium: 0, low: 0, info: 0,
	};

	for (const f of org.findings) {
		findingsBySeverity[f.severity]++;
	}
	for (const r of repos) {
		for (const f of r.findings) {
			findingsBySeverity[f.severity]++;
		}
	}

	const summary: FleetSummary = {
		reposDiscovered: repos.length,
		reposScanned: repos.length,
		reposSkipped: 0,
		reposFailed: 0,
		listingComplete: true,
		rulesRun: org.runs.length + repos.reduce((sum, r) => sum + r.runs.length, 0),
		rulesErrored: 0,
		rulesSkipped: 0,
		findingsTotal: allFindings,
		findingsBySeverity,
	};

	return {
		schemaVersion: 1,
		target: { type: 'org-fleet', org: 'silverwalls-labs' },
		threshold: 'high',
		org,
		repos,
		skipped: [],
		failures: [],
		summary,
	};
}
