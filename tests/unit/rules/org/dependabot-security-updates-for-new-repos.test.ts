import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import {
	rule,
} from '../../../../src/rules/org/dependabot-security-updates-for-new-repos.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs';

describe('org/dependabot-security-updates-for-new-repos', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when security updates are enabled for new repos', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({
				dependabotSecurityUpdatesEnabledForNewRepositories: true,
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when security updates are not enabled for new repos', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgResponse({
				dependabotSecurityUpdatesEnabledForNewRepositories: false,
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/dependabot-security-updates-for-new-repos');
		assert.equal(findings[0]?.severity, 'medium');
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
