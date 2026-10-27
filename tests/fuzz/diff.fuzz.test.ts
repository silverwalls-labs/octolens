import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
	diffFindings,
	fingerprint,
	filterScanResult,
} from '../../src/engine/diff.ts';
import {
	arbFinding,
	arbScanResult,
	fuzzParams,
} from '../helpers/arbitraries.ts';
import type { Finding, ScanResult } from '../../src/types/index.ts';

describe('diff fuzz', () => {
	test('added + unchanged === current.length', () => {
		fc.assert(fc.property(
			fc.array(arbFinding, { maxLength: 8 }),
			fc.array(arbFinding, { maxLength: 8 }),
			(baseline: Finding[], current: Finding[]): void => {
				const { summary } = diffFindings(baseline, current);

				assert.equal(
					summary.added + summary.unchanged,
					current.length,
				);
			},
		), fuzzParams);
	});

	test('diffing identical arrays produces zero added', () => {
		fc.assert(fc.property(
			fc.array(arbFinding, { maxLength: 8 }),
			(findings: Finding[]): void => {
				const { added, summary } = diffFindings(findings, findings);

				assert.equal(added.length, 0);
				assert.equal(summary.added, 0);
				assert.equal(summary.removed, 0);
				assert.equal(summary.unchanged, findings.length);
			},
		), fuzzParams);
	});

	test('every added finding is referentially from current', () => {
		fc.assert(fc.property(
			fc.array(arbFinding, { maxLength: 8 }),
			fc.array(arbFinding, { maxLength: 8 }),
			(baseline: Finding[], current: Finding[]): void => {
				const { added } = diffFindings(baseline, current);

				for (const finding of added) {
					assert.ok(
						current.includes(finding),
						'added finding is not from the current array',
					);
				}
			},
		), fuzzParams);
	});

	test('fingerprint is deterministic', () => {
		fc.assert(fc.property(
			arbFinding,
			(finding: Finding): void => {
				assert.equal(
					fingerprint(finding),
					fingerprint(finding),
				);
			},
		), fuzzParams);
	});

	test('filterScanResult preserves structural fields', () => {
		fc.assert(fc.property(
			arbScanResult,
			(result: ScanResult): void => {
				const filtered = filterScanResult(result, []);

				assert.equal(filtered.schemaVersion, result.schemaVersion);
				assert.deepEqual(filtered.target, result.target);
				assert.equal(filtered.threshold, result.threshold);
				assert.equal(filtered.runs.length, result.runs.length);
				assert.equal(filtered.findings.length, 0);
				assert.equal(filtered.summary.findingsTotal, 0);
			},
		), fuzzParams);
	});
});
