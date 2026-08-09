import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/cicd/forbid-workflow-pr-approval.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/actions/permissions/workflow';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when workflows cannot approve PRs', forbiddenCase);

async function forbiddenCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, {
			default_workflow_permissions: 'read',
			can_approve_pull_request_reviews: false,
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when workflows can approve PRs', allowedCase);

async function allowedCase() {
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
}

test('reports no findings when the field is missing (defaults false)', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, {
			default_workflow_permissions: 'read',
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
