import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/security/secret-scanning-push-protection.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when push protection is enabled', enabledCase);

async function enabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({
			secretScanning: 'enabled',
			secretScanningPushProtection: 'enabled',
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when push protection is disabled', disabledCase);

async function disabledCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({
			secretScanning: 'enabled',
			secretScanningPushProtection: 'disabled',
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'security/secret-scanning-push-protection');
	assert.equal(findings[0]?.severity, 'high');
}

test('reports a finding when security_and_analysis is absent', absentCase);

async function absentCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({ secretScanning: 'absent' }));

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
