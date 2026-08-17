import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { exitCodeFor, exitCodeForReport } from '../../../src/engine/index.ts';
import type {
	FailedRepo, Finding, FleetSummary,
	OrgScanReport, ScanResult, ScanSummary,
} from '../../../src/types/index.ts';

type ResultOptions = {
	summary?: Partial<ScanSummary>;
	findings?: Finding[];
};

const FINDING: Finding = {
	ruleId: 'repo-config/branch-protection-required',
	severity: 'high',
	repo: { owner: 'sheplu', name: 'editorconfig' },
	title: 'example',
};

type ReportOptions = {
	summary?: Partial<FleetSummary>;
	failures?: FailedRepo[];
};

describe('exitCodeFor', () => {
	test('exit 0 on a clean, complete scan', () => {
		assert.equal(exitCodeFor(makeResult()), 0);
	});

	test('exit 1 when findings exist regardless of flags', () => {
		const result = makeResult({ findings: [ FINDING ] });

		assert.equal(exitCodeFor(result), 1);
		assert.equal(
			exitCodeFor(result, { failOnIncomplete: true }),
			1,
		);
	});

	test(
		'incomplete coverage exits 0 by default, 1 under fail-on-skip',
		() => {
			const skipped = makeResult({
				summary: { rulesSkipped: 2 },
			});
			const errored = makeResult({
				summary: { rulesErrored: 1 },
			});

			assert.equal(exitCodeFor(skipped), 0);
			assert.equal(exitCodeFor(errored), 0);
			assert.equal(
				exitCodeFor(skipped, { failOnIncomplete: true }),
				1,
			);
			assert.equal(
				exitCodeFor(errored, { failOnIncomplete: true }),
				1,
			);
		},
	);

	test('report: exit 0 on a clean, complete fleet scan', () => {
		assert.equal(exitCodeForReport(makeReport()), 0);
		assert.equal(
			exitCodeForReport(
				makeReport(),
				{ failOnIncomplete: true },
			),
			0,
		);
	});

	test('report: exit 1 when findings exist anywhere', () => {
		const report = makeReport({
			summary: { findingsTotal: 1 },
		});

		assert.equal(exitCodeForReport(report), 1);
	});

	test(
		'report: incomplete coverage exits 1 only under fail-on-skip',
		() => {
			const failure: FailedRepo = {
				repo: {
					owner: 'silverwalls-labs',
					name: 'broken',
				},
				error: 'boom',
			};
			const withFailure = makeReport({
				failures: [ failure ],
			});
			const withSkips = makeReport({
				summary: { rulesSkipped: 3 },
			});
			const truncated = makeReport({
				summary: { listingComplete: false },
			});

			assert.equal(exitCodeForReport(withFailure), 0);
			assert.equal(exitCodeForReport(withSkips), 0);
			assert.equal(exitCodeForReport(truncated), 0);
			assert.equal(
				exitCodeForReport(
					withFailure,
					{ failOnIncomplete: true },
				),
				1,
			);
			assert.equal(
				exitCodeForReport(
					withSkips,
					{ failOnIncomplete: true },
				),
				1,
			);
			assert.equal(
				exitCodeForReport(
					truncated,
					{ failOnIncomplete: true },
				),
				1,
			);
		},
	);
});

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

function makeReport(options: ReportOptions = {}): OrgScanReport {
	const summary: FleetSummary = {
		reposDiscovered: 2,
		reposScanned: 2,
		reposSkipped: 0,
		reposFailed: options.failures?.length ?? 0,
		listingComplete: true,
		rulesRun: 20,
		rulesErrored: 0,
		rulesSkipped: 0,
		findingsTotal: 0,
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
		target: { type: 'org-fleet', org: 'silverwalls-labs' },
		threshold: 'high',
		org: makeResult(),
		repos: [],
		skipped: [],
		failures: options.failures ?? [],
		summary,
	};
}
