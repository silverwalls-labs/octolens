import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/actions-allowlist.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgActionsPermissionsResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/actions/permissions';

describe('org/actions-allowlist', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when actions are restricted to selected', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'selected' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when actions are restricted to local only', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'local_only' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when actions are disabled for all repositories', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgActionsPermissionsResponse({
				enabledRepositories: 'none',
				allowedActions: 'all',
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when all marketplace actions are allowed', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'all' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/actions-allowlist');
		assert.equal(findings[0]?.severity, 'medium');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.equal(findings[0]?.repo, undefined);
	});

	test('skips on a permission-denied 403', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(403, { message: 'Must have admin rights' });

		await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeOrgContext()));
	});
});
