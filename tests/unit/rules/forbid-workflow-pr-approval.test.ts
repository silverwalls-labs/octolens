import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/cicd/forbid-workflow-pr-approval.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/actions/permissions/workflow';

describe('cicd/forbid-workflow-pr-approval', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when workflows cannot approve PRs', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, {
				default_workflow_permissions: 'read',
				can_approve_pull_request_reviews: false,
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when workflows can approve PRs', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, {
				default_workflow_permissions: 'read',
				can_approve_pull_request_reviews: true,
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'cicd/forbid-workflow-pr-approval');
		assert.equal(findings[0]?.severity, 'high');
	});

	test('reports no findings when the field is missing (defaults false)', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(200, {
				default_workflow_permissions: 'read',
			});

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('skips when workflow permissions endpoint returns 404', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(404, { message: 'Not Found' });

		await assert.rejects(rule.check(makeContext()), RuleSkipped);
	});

	test('skips when workflow permissions endpoint returns a permission 403', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(403, { message: 'Resource not accessible by integration' });

		await assert.rejects(rule.check(makeContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(ENDPOINT)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
