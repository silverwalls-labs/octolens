import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/default-repo-permission.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs';

describe('org/default-repo-permission', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when the base permission is read', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ defaultRepositoryPermission: 'read' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when the base permission is none', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ defaultRepositoryPermission: 'none' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when the base permission is write', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ defaultRepositoryPermission: 'write' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/default-repo-permission');
		assert.equal(findings[0]?.severity, 'high');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.match(findings[0]?.title ?? '', /"write"/);
	});

	test('reports a finding on unknown permission values (fail-closed)', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ defaultRepositoryPermission: 'maintain' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
	});

	test('skips when the field is not visible (non-owner token)', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ privileged: false }));

		await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeOrgContext()));
	});
});
