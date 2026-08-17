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
} from '../../../../src/rules/org/limit-private-fork-pr-workflows.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgPrivateForkPrResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/actions/permissions/fork-pr-workflows-private-repos';

describe('org/limit-private-fork-pr-workflows', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when fork PR workflows are disabled', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgPrivateForkPrResponse({
				runWorkflowsFromForkPullRequests: false,
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when enabled but fully hardened', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgPrivateForkPrResponse({
				runWorkflowsFromForkPullRequests: true,
				sendWriteTokensToWorkflows: false,
				sendSecretsAndVariables: false,
				requireApprovalForForkPrWorkflows: true,
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding listing each weak setting', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgPrivateForkPrResponse({
				runWorkflowsFromForkPullRequests: true,
				sendWriteTokensToWorkflows: true,
				sendSecretsAndVariables: true,
				requireApprovalForForkPrWorkflows: false,
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/limit-private-fork-pr-workflows');
		assert.equal(findings[0]?.severity, 'high');
		assert.equal(findings[0]?.org, 'silverwalls-labs');
		assert.match(findings[0]?.detail ?? '', /write tokens/);
		assert.match(findings[0]?.detail ?? '', /secrets and variables/);
		assert.match(findings[0]?.detail ?? '', /without admin approval/);
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
