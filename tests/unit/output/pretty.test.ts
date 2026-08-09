import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatPretty } from '../../../src/output/pretty.ts';
import type {
	Finding, RuleRun, ScanResult,
} from '../../../src/types/index.ts';

function makeResult(findings: Finding[], runs: RuleRun[] = []): ScanResult {
	const findingsBySeverity = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: 'sheplu', name: 'editorconfig',
		},
		threshold: 'info',
		runs,
		findings,
		summary: {
			rulesRun: runs.length,
			rulesErrored: runs.filter((r) => r.status === 'error').length,
			rulesSkipped: runs.filter((r) => r.status === 'skipped').length,
			findingsTotal: findings.length,
			findingsBySeverity,
		},
	};
}

const FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'critical',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'Default branch is not protected',
};

test('renders a coverage footer covering every run outcome', rendersCoverage);

function rendersCoverage() {
	const runs: RuleRun[] = [
		{
			ruleId: 'repo-config/branch-protection-required',
			status: 'ok',
			findings: [ FINDING ],
			durationMs: 5,
		},
		{
			ruleId: 'repo-config/license-file-present',
			status: 'ok',
			findings: [],
			durationMs: 1,
		},
		{
			ruleId: 'access/required-custom-properties',
			status: 'skipped',
			findings: [],
			durationMs: 0,
		},
		{
			ruleId: 'security/secrets-rotation',
			status: 'error',
			findings: [],
			error: 'boom',
			durationMs: 2,
		},
	];
	const out = formatPretty(makeResult([ FINDING ], runs), { color: false });

	assert.match(out, /1 passed · 1 flagged · 1 skipped · 1 errored/);
}

test('omits the coverage footer when no runs are present', omitsCoverage);

function omitsCoverage() {
	const out = formatPretty(makeResult([ FINDING ]), { color: false });

	assert.doesNotMatch(out, /passed ·/);
}

test('renders org target label', orgTargetCase);

function orgTargetCase() {
	const result: ScanResult = {
		...makeResult([]),
		target: { type: 'org', org: 'my-org' },
	};
	const out = formatPretty(result, { color: false });

	assert.match(out, /my-org/);
}

test('renders finding detail, remediation, and references', fullFindingCase);

function fullFindingCase() {
	const full: Finding = {
		...FINDING,
		detail: 'The default branch has no protection rule.',
		remediation: 'Add a branch protection rule.',
		references: [ { name: 'About branches', url: 'https://example.com' } ],
	};
	const out = formatPretty(makeResult([ full ]), { color: false });

	assert.match(out, /The default branch has no protection rule\./);
	assert.match(out, /Remediation: Add a branch protection rule\./);
	assert.match(out, /About branches: https:\/\/example\.com/);
}

test('renders no-findings message when findings are empty', noFindingsCase);

function noFindingsCase() {
	const out = formatPretty(makeResult([]), { color: false });

	assert.match(out, /No findings at or above severity threshold\./);
}

test('uses identity colorizer when color option is true', colorCase);

function colorCase() {
	const out = formatPretty(makeResult([ FINDING ]), { color: true });

	assert.match(out, /CRITICAL/);
	assert.match(out, /Default branch is not protected/);
}
