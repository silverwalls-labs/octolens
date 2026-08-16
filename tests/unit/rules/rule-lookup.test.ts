import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
	allRules,
	allOrgRules,
	findRuleById,
	findOrgRuleById,
} from '../../../src/rules/index.ts';

test('findRuleById returns the matching repo rule', findRepoRuleHit);

function findRepoRuleHit() {
	const rule = findRuleById('repo-config/block-force-push');

	assert.ok(rule);
	assert.equal(rule.id, 'repo-config/block-force-push');
	assert.ok(allRules.includes(rule));
}

test('findRuleById returns undefined for unknown IDs', findRepoRuleMiss);

function findRepoRuleMiss() {
	assert.equal(findRuleById('repo-config/does-not-exist'), undefined);
}

test('findOrgRuleById returns the matching org rule', findOrgRuleHit);

function findOrgRuleHit() {
	const rule = findOrgRuleById('org/two-factor-required');

	assert.ok(rule);
	assert.equal(rule.id, 'org/two-factor-required');
	assert.ok(allOrgRules.includes(rule));
}

test('findOrgRuleById returns undefined for unknown IDs', findOrgRuleMiss);

function findOrgRuleMiss() {
	assert.equal(findOrgRuleById('org/does-not-exist'), undefined);
}
