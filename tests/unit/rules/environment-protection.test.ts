import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/environment-protection.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/environments';

describe('repo-config/environment-protection', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when no environments exist', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, { total_count: 0, environments: [] });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when environments have protection rules', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, {
				total_count: 1,
				environments: [
					{
						name: 'production',
						protection_rules: [ { type: 'required_reviewers', reviewers: [] } ],
						deployment_branch_policy: null,
					},
				],
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports one finding per unprotected environment', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.query({ per_page: '100' })
			.reply(200, {
				total_count: 2,
				environments: [
					{
						name: 'staging',
						protection_rules: [],
						deployment_branch_policy: null,
					},
					{
						name: 'production',
						protection_rules: [],
						deployment_branch_policy: { protected_branches: true },
					},
				],
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/environment-protection');
		assert.equal(findings[0]?.severity, 'medium');
		assert.match(findings[0]?.title ?? '', /staging/);
	});

	test('skips when the environments endpoint returns 404', async () => {
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
