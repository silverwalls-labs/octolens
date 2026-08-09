import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/cicd/actions-allowlist.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/actions/permissions';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when allowed_actions is selected', selectedCase);

async function selectedCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, { enabled: true, allowed_actions: 'selected' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when Actions is disabled', disabledCase);

async function disabledCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, { enabled: false, allowed_actions: null });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when allowed_actions is "all"', allCase);

async function allCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, { enabled: true, allowed_actions: 'all' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'cicd/actions-allowlist');
	assert.equal(findings[0]?.severity, 'medium');
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
