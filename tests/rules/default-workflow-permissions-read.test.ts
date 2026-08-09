import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/cicd/default-workflow-permissions-read.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/actions/permissions/workflow';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when default permissions are read', readCase);

async function readCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, {
			default_workflow_permissions: 'read',
			can_approve_pull_request_reviews: false,
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when default permissions are write', writeCase);

async function writeCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, {
			default_workflow_permissions: 'write',
			can_approve_pull_request_reviews: false,
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'cicd/default-workflow-permissions-read');
	assert.equal(findings[0]?.severity, 'high');
}

test('reports a finding when permission level is missing', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, {
			can_approve_pull_request_reviews: false,
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
