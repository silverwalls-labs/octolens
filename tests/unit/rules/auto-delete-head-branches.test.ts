import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/auto-delete-head-branches.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when delete_branch_on_merge is true', enabledCase);

async function enabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({ deleteBranchOnMerge: true }));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when delete_branch_on_merge is false', disabledCase);

async function disabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({ deleteBranchOnMerge: false }));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'repo-config/auto-delete-head-branches');
	assert.equal(findings[0]?.severity, 'low');
}

test('reports a finding when the field is missing', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, {
			name: 'Octolens',
			full_name: 'sheplu/Octolens',
			owner: { login: 'sheplu' },
			default_branch: 'main',
			license: null,
			security_and_analysis: null,
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
