import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/security/dependabot-alerts-enabled.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when alerts are enabled (204)', alertsEnabledCase);

async function alertsEnabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/vulnerability-alerts')
		.reply(204);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when alerts are disabled (404)', alertsDisabledCase);

async function alertsDisabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/vulnerability-alerts')
		.reply(404, { message: 'Not Found' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/dependabot-alerts-enabled');
	assert.equal(findings[0]?.severity, 'high');
	assert.deepEqual(findings[0]?.repo, { owner: 'sheplu', name: 'Octolens' });
}

test('propagates non-404 errors (e.g. 401)', alertsAuthErrorCase);

async function alertsAuthErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/vulnerability-alerts')
		.reply(401, { message: 'Bad credentials' });

	await assert.rejects(rule.check(makeContext()));
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/vulnerability-alerts')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
