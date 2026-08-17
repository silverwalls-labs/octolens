import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import {
	compareSeverity,
	isSeverity,
	meetsThreshold,
} from '../../src/types/index.ts';
import { exitCodeFor, exitCodeForReport } from '../../src/engine/index.ts';
import { subjectLabel } from '../../src/output/subject.ts';
import {
	arbFinding,
	arbOrgScanReport,
	arbScanResult,
	arbSeverity,
	arbText,
	fuzzParams,
} from '../helpers/arbitraries.ts';
import type {
	Finding,
	OrgScanReport,
	ScanResult,
	Severity,
} from '../../src/types/index.ts';

const LEVELS = [
	'critical',
	'high',
	'medium',
	'low',
	'info',
];

describe('invariants fuzz', () => {
	test('compareSeverity is a total order consistent with meetsThreshold', () => {
		fc.assert(
			fc.property(
				arbSeverity,
				arbSeverity,
				arbSeverity,
				(a: Severity, b: Severity, c: Severity): void => {
					// Antisymmetry (=== so that 0 and -0 compare equal).
					assert.ok(Math.sign(compareSeverity(a, b)) ===
						- Math.sign(compareSeverity(b, a)));

					// Transitivity.
					if (compareSeverity(a, b) <= 0 && compareSeverity(b, c) <= 0) {
						assert.ok(compareSeverity(a, c) <= 0);
					}

					// meetsThreshold agrees with the comparator.
					assert.equal(
						meetsThreshold(a, b),
						compareSeverity(a, b) <= 0,
					);
				},
			),
			fuzzParams,
		);
	});

	test('isSeverity accepts only the five levels', () => {
		fc.assert(fc.property(arbText, (value: string): void => {
			assert.equal(isSeverity(value), LEVELS.includes(value));
		}), fuzzParams);
	});

	test('exit codes are always binary and justified', () => {
		fc.assert(fc.property(
			arbScanResult,
			fc.boolean(),
			(result: ScanResult, failOnIncomplete: boolean): void => {
				const code = exitCodeFor(result, { failOnIncomplete });

				assert.ok(code === 0 || code === 1);

				const incomplete =
					result.summary.rulesErrored > 0 ||
					result.summary.rulesSkipped > 0;
				const expected =
					result.findings.length > 0 ||
					(failOnIncomplete && incomplete);

				assert.equal(code, expected ?
					1 :
					0);
			},
		), fuzzParams);
	});

	test('fleet exit codes are always binary and justified', () => {
		fc.assert(fc.property(
			arbOrgScanReport,
			fc.boolean(),
			(report: OrgScanReport, failOnIncomplete: boolean): void => {
				const code = exitCodeForReport(report, { failOnIncomplete });

				assert.ok(code === 0 || code === 1);

				const incomplete =
					report.summary.rulesErrored > 0 ||
					report.summary.rulesSkipped > 0 ||
					report.failures.length > 0 ||
					!report.summary.listingComplete;
				const expected =
					report.summary.findingsTotal > 0 ||
					(failOnIncomplete && incomplete);

				assert.equal(code, expected ?
					1 :
					0);
			},
		), fuzzParams);
	});

	test('subjectLabel always yields a printable subject', () => {
		fc.assert(fc.property(arbFinding, (finding: Finding): void => {
			const label = subjectLabel(finding);

			assert.equal(typeof label, 'string');

			if (finding.repo !== undefined) {
				assert.equal(
					label,
					`${finding.repo.owner}/${finding.repo.name}`,
				);
			} else if (finding.org !== undefined) {
				assert.equal(label, finding.org);
			} else {
				assert.equal(label, '');
			}
		}), fuzzParams);
	});
});
