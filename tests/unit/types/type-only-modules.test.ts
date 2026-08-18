/*
 * The modules below contain only type declarations, so they normally never
 * appear in coverage reports. Loading them here keeps every src file visible
 * to the coverage runner and guards against accidental runtime additions.
 */
import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import * as config from '../../../src/types/config.ts';
import * as finding from '../../../src/types/finding.ts';
import * as orgScanReport from '../../../src/types/org-scan-report.ts';
import * as rule from '../../../src/types/rule.ts';
import * as scanResult from '../../../src/types/scan-result.ts';

describe('type-only modules', () => {
	test('type-only modules carry no runtime exports', () => {
		for (const mod of [
			config,
			finding,
			orgScanReport,
			rule,
			scanResult,
		]) {
			assert.deepEqual(Object.keys(mod), []);
		}
	});
});
