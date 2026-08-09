import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatMarkdown } from '../../src/output/markdown.ts';
import type {
	Finding, RuleRun, ScanResult,
} from '../../src/types/index.ts';

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
			rulesRun: 41,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: findings.length,
			findingsBySeverity,
		},
	};
}

const SAMPLE: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'critical',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: "Default branch 'main' is not protected",
	detail: 'The default branch has no protection rule.',
	remediation: 'Add a branch protection rule.',
	references: [ { name: 'About protected branches', url: 'https://docs.github.com/protected' } ],
};

test('renders header, summary table, and finding sections', rendersFull);

function rendersFull() {
	const md = formatMarkdown(makeResult([ SAMPLE ]));

	assert.match(md, /^# Octolens scan — sheplu\/editorconfig/);
	assert.match(md, /\| Severity \| Count \|/);
	assert.match(md, /\| Critical \| 1 \|/);
	assert.match(md, /## Findings \(1\)/);
	assert.match(md, /### Critical — Default branch 'main' is not protected/);
	assert.match(md, /`repo-config\/branch-protection-required` · sheplu\/editorconfig/);
	assert.match(md, /\*\*Remediation:\*\* Add a branch protection rule\./);
	assert.match(md, /- \[About protected branches\]\(https:\/\/docs\.github\.com\/protected\)/);
}

test('renders a clean-scan message when there are no findings', rendersEmpty);

function rendersEmpty() {
	const md = formatMarkdown(makeResult([]));

	assert.match(md, /No findings at or above the `info` threshold\./);
	assert.doesNotMatch(md, /## Findings/);
}

test('orders findings by severity descending', ordersBySeverity);

function ordersBySeverity() {
	const infoFinding: Finding = {
		ruleId: 'repo-config/topics-present',
		severity: 'info',
		repo: { owner: 'sheplu', name: 'editorconfig' },
		title: 'Repository has no topics',
	};
	const md = formatMarkdown(makeResult([ infoFinding, SAMPLE ]));

	const criticalAt = md.indexOf('Default branch');
	const infoAt = md.indexOf('Repository has no topics');

	assert.ok(criticalAt < infoAt, 'critical should appear before info');
}

test('renders a checks table covering every rule run', rendersChecks);

function rendersChecks() {
	const runs: RuleRun[] = [
		{
			ruleId: 'repo-config/branch-protection-required',
			status: 'ok',
			findings: [ SAMPLE ],
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
			ruleId: 'access/outside-collaborator-count',
			status: 'error',
			findings: [],
			error: 'boom',
			durationMs: 2,
		},
	];
	const md = formatMarkdown(makeResult([ SAMPLE ], runs));

	assert.match(md, /## Checks \(4\)/);
	assert.match(md, /1 passed · 1 flagged · 1 skipped · 1 errored\./);
	assert.match(md, /\| Result \| Rule \| Findings \|/);
	assert.match(md, /flagged \| `repo-config\/branch-protection-required` \| 1 \|/);
	assert.match(md, /pass \| `repo-config\/license-file-present` \| — \|/);
	assert.match(md, /skipped \| `access\/required-custom-properties` \| — \|/);
	assert.match(md, /error \| `access\/outside-collaborator-count` \| — \|/);
}

test('omits the checks section when no runs are present', omitsChecks);

function omitsChecks() {
	const md = formatMarkdown(makeResult([ SAMPLE ]));

	assert.doesNotMatch(md, /## Checks/);
}

test('renders org target in header', orgTargetCase);

function orgTargetCase() {
	const result: ScanResult = {
		...makeResult([]),
		target: { type: 'org', org: 'my-org' },
	};
	const md = formatMarkdown(result);

	assert.match(md, /^# Octolens scan — my-org/);
}
