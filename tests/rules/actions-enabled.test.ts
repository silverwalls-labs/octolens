import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/cicd/actions-enabled.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when Actions is enabled', enabledCase);

async function enabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/actions/permissions')
		.reply(200, { enabled: true, allowed_actions: 'all' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when Actions is disabled', disabledCase);

async function disabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/actions/permissions')
		.reply(200, { enabled: false, allowed_actions: null });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'cicd/actions-enabled');
	assert.equal(findings[0]?.severity, 'info');
}

test('reports a finding when permissions endpoint returns 404', notFoundCase);

async function notFoundCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/actions/permissions')
		.reply(404, { message: 'Not Found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}
