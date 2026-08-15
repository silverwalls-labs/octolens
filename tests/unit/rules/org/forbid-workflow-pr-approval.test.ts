import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/forbid-workflow-pr-approval.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgWorkflowPermissionsResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/actions/permissions/workflow';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when workflows cannot approve pull requests', passCase);

async function passCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgWorkflowPermissionsResponse({ canApprovePullRequestReviews: false }));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when workflows can approve pull requests', findingCase);

async function findingCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgWorkflowPermissionsResponse({ canApprovePullRequestReviews: true }));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'org/forbid-workflow-pr-approval');
	assert.equal(findings[0]?.severity, 'high');
	assert.equal(findings[0]?.org, 'silverwalls-labs');
	assert.equal(findings[0]?.repo, undefined);
}

test('skips on a permission-denied 403', forbiddenCase);

async function forbiddenCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(403, { message: 'Must have admin rights' });

	await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeOrgContext()));
}
