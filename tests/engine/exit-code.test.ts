import { test } from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeFor } from '../../src/engine/index.ts';
import type {
	Finding, ScanResult, ScanSummary,
} from '../../src/types/index.ts';

type ResultOptions = {
	summary?: Partial<ScanSummary>;
	findings?: Finding[];
};

function makeResult(options: ResultOptions = {}): ScanResult {
	const findings = options.findings ?? [];
	const summary: ScanSummary = {
		rulesRun: 10,
		rulesErrored: 0,
		rulesSkipped: 0,
		findingsTotal: findings.length,
		findingsBySeverity: {
			critical: 0,
			high: 0,
			medium: 0,
			low: 0,
			info: 0,
		},
		...options.summary,
	};

	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: 'sheplu', name: 'editorconfig',
		},
		threshold: 'high',
		runs: [],
		findings,
		summary,
	};
}

const FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'high',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'example',
};

test('exit 0 on a clean, complete scan', cleanScan);

function cleanScan() {
	assert.equal(exitCodeFor(makeResult()), 0);
}

test('exit 1 when findings exist regardless of flags', withFindings);

function withFindings() {
	const result = makeResult({ findings: [ FINDING ] });

	assert.equal(exitCodeFor(result), 1);
	assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
}

test('incomplete coverage exits 0 by default, 1 under fail-on-skip', incompleteCoverage);

function incompleteCoverage() {
	const skipped = makeResult({ summary: { rulesSkipped: 2 } });
	const errored = makeResult({ summary: { rulesErrored: 1 } });

	assert.equal(exitCodeFor(skipped), 0);
	assert.equal(exitCodeFor(errored), 0);
	assert.equal(exitCodeFor(skipped, { failOnIncomplete: true }), 1);
	assert.equal(exitCodeFor(errored, { failOnIncomplete: true }), 1);
}
