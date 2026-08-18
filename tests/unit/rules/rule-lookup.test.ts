import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	allRules,
	allOrgRules,
	findRuleById,
	findOrgRuleById,
} from '../../../src/rules/index.ts';

describe('rule lookup', () => {
	test('findRuleById returns the matching repo rule', () => {
		const rule = findRuleById('repo-config/block-force-push');

		assert.ok(rule);
		assert.equal(rule.id, 'repo-config/block-force-push');
		assert.ok(allRules.includes(rule));
	});

	test('findRuleById returns undefined for unknown IDs', () => {
		assert.equal(findRuleById('repo-config/does-not-exist'), undefined);
	});

	test('findOrgRuleById returns the matching org rule', () => {
		const rule = findOrgRuleById('org/two-factor-required');

		assert.ok(rule);
		assert.equal(rule.id, 'org/two-factor-required');
		assert.ok(allOrgRules.includes(rule));
	});

	test('findOrgRuleById returns undefined for unknown IDs', () => {
		assert.equal(findOrgRuleById('org/does-not-exist'), undefined);
	});
});
