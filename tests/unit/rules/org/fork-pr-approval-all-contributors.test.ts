import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import {
	rule,
} from '../../../../src/rules/org/fork-pr-approval-all-contributors.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgForkPrApprovalResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs/actions/permissions/fork-pr-contributor-approval';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when approval is required for all external contributors', passCase);

async function passCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgForkPrApprovalResponse('all_external_contributors'));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 0);
}

test('reports a finding on the first-time-contributors policy', firstTimeCase);

async function firstTimeCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgForkPrApprovalResponse('first_time_contributors'));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'org/fork-pr-approval-all-contributors');
	assert.equal(findings[0]?.severity, 'medium');
	assert.equal(findings[0]?.org, 'silverwalls-labs');
	assert.equal(findings[0]?.repo, undefined);
}

test('reports a finding on the weakest new-to-github policy', weakestCase);

async function weakestCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgForkPrApprovalResponse('first_time_contributors_new_to_github'));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 1);
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
