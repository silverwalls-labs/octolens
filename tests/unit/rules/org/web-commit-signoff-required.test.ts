import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/web-commit-signoff-required.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs';

describe('org/web-commit-signoff-required', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when web commit sign-off is required', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ webCommitSignoffRequired: true }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when web commit sign-off is not required', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({ webCommitSignoffRequired: false }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/web-commit-signoff-required');
		assert.equal(findings[0]?.severity, 'low');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.equal(findings[0]?.repo, undefined);
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
