import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
	formatJson,
	formatMarkdown,
	formatMarkdownReport,
	formatPretty,
	formatPrettyReport,
	formatSarif,
} from '../../src/output/index.ts';
import {
	arbOrgScanReport,
	arbScanResult,
	fuzzParams,
} from '../helpers/arbitraries.ts';
import type { OrgScanReport, ScanResult } from '../../src/types/index.ts';

describe('formatters fuzz', () => {
	test('formatJson round-trips any scan result', () => {
		fc.assert(fc.property(arbScanResult, (result: ScanResult): void => {
			assert.deepEqual(JSON.parse(formatJson(result)), result);
		}), fuzzParams);
	});

	test('formatJson round-trips any fleet report', () => {
		fc.assert(fc.property(arbOrgScanReport, (report: OrgScanReport): void => {
			assert.deepEqual(JSON.parse(formatJson(report)), report);
		}), fuzzParams);
	});

	test('markdown and pretty renderers never crash or leak undefined', () => {
		fc.assert(fc.property(arbScanResult, (result: ScanResult): void => {
			const md = formatMarkdown(result);

			assert.equal(typeof md, 'string');
			assert.doesNotMatch(md, /\bundefined\b/);

			const plain = formatPretty(result, { color: false });

			assert.equal(typeof plain, 'string');
			assert.doesNotMatch(plain, /\bundefined\b/);

			assert.equal(typeof formatPretty(result, { color: true }), 'string');
		}), fuzzParams);
	});

	test('fleet report renderers never crash or leak undefined', () => {
		fc.assert(fc.property(arbOrgScanReport, (report: OrgScanReport): void => {
			const md = formatMarkdownReport(report);

			assert.equal(typeof md, 'string');
			assert.doesNotMatch(md, /\bundefined\b/);

			const plain = formatPrettyReport(report, { color: false });

			assert.equal(typeof plain, 'string');
			assert.doesNotMatch(plain, /\bundefined\b/);

			assert.equal(typeof formatPrettyReport(report, { color: true }), 'string');
		}), fuzzParams);
	});

	test('formatSarif emits one valid run for any scan result', () => {
		fc.assert(fc.property(arbScanResult, (result: ScanResult): void => {
			const run = parseSarifRun(formatSarif(result, { toolVersion: '0.0.0' }));

			assert.equal(run.results.length, result.findings.length);
			assertResultsWellFormed(run);
		}), fuzzParams);
	});

	test('formatSarif flattens any fleet report into one run', () => {
		fc.assert(fc.property(arbOrgScanReport, (report: OrgScanReport): void => {
			const run = parseSarifRun(formatSarif(report, { toolVersion: '0.0.0' }));
			const expected = report.org.findings.length +
				report.repos.reduce((sum, repo) => sum + repo.findings.length, 0);

			assert.equal(run.results.length, expected);
			assertResultsWellFormed(run);
		}), fuzzParams);
	});
});

type ParsedSarifRun = {
	tool: { driver: { rules: { id: string; }[]; }; };
	results: {
		ruleId: string;
		ruleIndex: number;
		locations: { physicalLocation: { region: { startLine: number; }; }; }[];
	}[];
};

function parseSarifRun(raw: string): ParsedSarifRun {
	const doc = JSON.parse(raw) as { version: string; runs: ParsedSarifRun[]; };

	assert.equal(doc.version, '2.1.0');
	assert.equal(doc.runs.length, 1);

	return doc.runs[0];
}

function assertResultsWellFormed(run: ParsedSarifRun): void {
	for (const result of run.results) {
		assert.equal(result.locations.length, 1);
		assert.equal(result.locations[0].physicalLocation.region.startLine, 1);
		assert.equal(run.tool.driver.rules[result.ruleIndex].id, result.ruleId);
	}
}
