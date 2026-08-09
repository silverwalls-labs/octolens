import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/tag-protection.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRulesetsResponse } from '../../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when an active tag ruleset exists', tagRulesetCase);

async function tagRulesetCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(200, makeRulesetsResponse([
			{
				id: 1,
				name: 'Tag protection',
				target: 'tag',
				enforcement: 'active',
			},
		]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when no rulesets exist', emptyCase);

async function emptyCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(200, makeRulesetsResponse([]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'repo-config/tag-protection');
	assert.equal(findings[0]?.severity, 'medium');
}

test('reports a finding when only branch rulesets exist', branchOnlyCase);

async function branchOnlyCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(200, makeRulesetsResponse([
			{
				id: 1,
				name: 'Branch protection',
				target: 'branch',
				enforcement: 'active',
			},
		]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('reports a finding when tag ruleset is in evaluate mode', evaluateModeCase);

async function evaluateModeCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(200, makeRulesetsResponse([
			{
				id: 1,
				name: 'Tag protection',
				target: 'tag',
				enforcement: 'evaluate',
			},
		]));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('reports a finding when rulesets endpoint returns 404', notFoundCase);

async function notFoundCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(404, { message: 'Not Found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/rulesets')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
