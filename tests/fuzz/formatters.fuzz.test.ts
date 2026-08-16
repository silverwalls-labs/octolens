import { test } from 'node:test';
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

test('formatJson round-trips any scan result', fuzzJsonRoundTrip);

function fuzzJsonRoundTrip() {
	fc.assert(fc.property(arbScanResult, checkJsonRoundTrip), fuzzParams);
}

function checkJsonRoundTrip(result: ScanResult): void {
	assert.deepEqual(JSON.parse(formatJson(result)), result);
}

test('formatJson round-trips any fleet report', fuzzJsonReportRoundTrip);

function fuzzJsonReportRoundTrip() {
	fc.assert(fc.property(arbOrgScanReport, checkJsonReportRoundTrip), fuzzParams);
}

function checkJsonReportRoundTrip(report: OrgScanReport): void {
	assert.deepEqual(JSON.parse(formatJson(report)), report);
}

test('markdown and pretty renderers never crash or leak undefined', fuzzResultRenderers);

function fuzzResultRenderers() {
	fc.assert(fc.property(arbScanResult, checkResultRenderers), fuzzParams);
}

function checkResultRenderers(result: ScanResult): void {
	const md = formatMarkdown(result);

	assert.equal(typeof md, 'string');
	assert.doesNotMatch(md, /\bundefined\b/);

	const plain = formatPretty(result, { color: false });

	assert.equal(typeof plain, 'string');
	assert.doesNotMatch(plain, /\bundefined\b/);

	assert.equal(typeof formatPretty(result, { color: true }), 'string');
}

test('fleet report renderers never crash or leak undefined', fuzzReportRenderers);

function fuzzReportRenderers() {
	fc.assert(fc.property(arbOrgScanReport, checkReportRenderers), fuzzParams);
}

function checkReportRenderers(report: OrgScanReport): void {
	const md = formatMarkdownReport(report);

	assert.equal(typeof md, 'string');
	assert.doesNotMatch(md, /\bundefined\b/);

	const plain = formatPrettyReport(report, { color: false });

	assert.equal(typeof plain, 'string');
	assert.doesNotMatch(plain, /\bundefined\b/);

	assert.equal(typeof formatPrettyReport(report, { color: true }), 'string');
}
