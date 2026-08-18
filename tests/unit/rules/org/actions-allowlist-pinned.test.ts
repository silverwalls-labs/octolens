import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/actions-allowlist-pinned.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import {
	makeOrgActionsPermissionsResponse,
	makeOrgAllowedActionsResponse,
} from '../../../helpers/fixtures.ts';

const PERMISSIONS = '/orgs/silverwalls-labs/actions/permissions';
const SELECTED = '/orgs/silverwalls-labs/actions/permissions/selected-actions';
const SHA = '8f4b7f84864484a7bf31766abe9204da3cbe65b3';

describe('org/actions-allowlist-pinned', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when every pattern is SHA-pinned', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'selected' }));
		nock('https://api.github.com')
			.get(SELECTED)
			.reply(200, makeOrgAllowedActionsResponse({
				patternsAllowed: [ `actions/checkout@${SHA}`, `actions/setup-node@${SHA}` ],
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when the allowlist is not in use', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'local_only' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding listing wildcard and tag patterns', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'selected' }));
		nock('https://api.github.com')
			.get(SELECTED)
			.reply(200, makeOrgAllowedActionsResponse({
				patternsAllowed: [
					'some-owner/*',
					'actions/setup-node@v4',
					`actions/checkout@${SHA}`,
				],
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/actions-allowlist-pinned');
		assert.equal(findings[0]?.severity, 'medium');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.match(findings[0]?.title ?? '', /2 allowlisted/);
		assert.match(findings[0]?.detail ?? '', /some-owner\/\*/);
		assert.match(findings[0]?.detail ?? '', /actions\/setup-node@v4/);
		assert.doesNotMatch(findings[0]?.detail ?? '', new RegExp(SHA));
	});

	test('skips on a permission-denied 403', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(403, { message: 'Must have admin rights' });

		await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
	});

	test('skips when the allowlist itself is not readable', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(200, makeOrgActionsPermissionsResponse({ allowedActions: 'selected' }));
		nock('https://api.github.com')
			.get(SELECTED)
			.reply(403, { message: 'Must have admin rights' });

		await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(PERMISSIONS)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeOrgContext()));
	});
});
