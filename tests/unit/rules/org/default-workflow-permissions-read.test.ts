import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/default-workflow-permissions-read.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgWorkflowPermissionsResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/actions/permissions/workflow';

describe('org/default-workflow-permissions-read', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when the default is read-only', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgWorkflowPermissionsResponse({ defaultWorkflowPermissions: 'read' }));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when the default is write', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, makeOrgWorkflowPermissionsResponse({
				defaultWorkflowPermissions: 'write',
			}));

		const findings = await rule.check(makeOrgContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'org/default-workflow-permissions-read');
		assert.equal(findings[0]?.severity, 'high');
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
