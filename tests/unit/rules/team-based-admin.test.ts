import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/access/team-based-admin.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/teams';

describe('access/team-based-admin', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when at least one team has admin access', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, [
				{
					slug: 'platform', name: 'Platform', permission: 'admin',
				},
				{
					slug: 'frontend', name: 'Frontend', permission: 'push',
				},
			]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when no team has admin access', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, [
				{
					slug: 'frontend', name: 'Frontend', permission: 'maintain',
				},
				{
					slug: 'reviewers', name: 'Reviewers', permission: 'push',
				},
			]);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'access/team-based-admin');
		assert.equal(findings[0]?.severity, 'info');
	});

	test('reports a finding when no teams are attached', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, []);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'access/team-based-admin');
	});

	test('skips when teams cannot be listed (no permission)', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(404, { message: 'Not Found' });

		await assert.rejects(rule.check(makeContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
