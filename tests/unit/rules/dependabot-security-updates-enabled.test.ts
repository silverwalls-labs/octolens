import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/security/dependabot-security-updates-enabled.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/automated-security-fixes';

describe('security/dependabot-security-updates-enabled', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when security updates are enabled', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, { enabled: true, paused: false });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when security updates are disabled', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, { enabled: false, paused: false });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'security/dependabot-security-updates-enabled');
		assert.equal(findings[0]?.severity, 'high');
	});

	test('reports a finding when the endpoint returns 404', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(404, { message: 'Not Found' });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
