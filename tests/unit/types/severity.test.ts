import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	compareSeverity,
	isSeverity,
	meetsThreshold,
	type Severity,
} from '../../../src/types/severity.ts';

describe('severity', () => {
	test('isSeverity recognizes valid levels', () => {
		assert.equal(isSeverity('critical'), true);
		assert.equal(isSeverity('info'), true);
		assert.equal(isSeverity('nope'), false);
	});

	test('compareSeverity orders highest first', () => {
		const input: Severity[] = [
			'low',
			'critical',
			'medium',
		];
		const sorted = [ ...input ].sort(compareSeverity);

		assert.deepEqual(sorted, [
			'critical',
			'medium',
			'low',
		]);
	});

	test('meetsThreshold respects ordering', () => {
		assert.equal(meetsThreshold('critical', 'high'), true);
		assert.equal(meetsThreshold('high', 'high'), true);
		assert.equal(meetsThreshold('medium', 'high'), false);
		assert.equal(meetsThreshold('info', 'info'), true);
	});
});
