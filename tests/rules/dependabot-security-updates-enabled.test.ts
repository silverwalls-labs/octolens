import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/security/dependabot-security-updates-enabled.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/automated-security-fixes';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when security updates are enabled', enabledCase);

async function enabledCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, { enabled: true, paused: false });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when security updates are disabled', disabledCase);

async function disabledCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, { enabled: false, paused: false });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/dependabot-security-updates-enabled');
	assert.equal(findings[0]?.severity, 'high');
}

test('reports a finding when the endpoint returns 404', notFoundCase);

async function notFoundCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(404, { message: 'Not Found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}
