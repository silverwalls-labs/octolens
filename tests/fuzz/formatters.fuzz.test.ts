import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
	formatJson,
	formatMarkdown,
	formatMarkdownReport,
	formatPretty,
	formatPrettyReport,
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
});
