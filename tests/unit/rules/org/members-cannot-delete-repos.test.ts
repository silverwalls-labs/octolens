import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../../src/rules/org/members-cannot-delete-repos.ts';
import { RuleSkipped } from '../../../../src/types/index.ts';
import {
	disableNet, makeOrgContext, restoreNet,
} from '../../../helpers/context.ts';
import { makeOrgResponse } from '../../../helpers/fixtures.ts';

const ENDPOINT = '/orgs/silverwalls-labs';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when members cannot delete repos', passCase);

async function passCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgResponse({ membersCanDeleteRepositories: false }));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when members can delete or transfer repos', findingCase);

async function findingCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgResponse({ membersCanDeleteRepositories: true }));

	const findings = await rule.check(makeOrgContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'org/members-cannot-delete-repos');
	assert.equal(findings[0]?.severity, 'medium');
	assert.equal(findings[0]?.org, 'silverwalls-labs');
	assert.equal(findings[0]?.repo, undefined);
}

test('skips when the field is not visible (non-owner token)', hiddenCase);

async function hiddenCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(200, makeOrgResponse({ privileged: false }));

	await assert.rejects(rule.check(makeOrgContext()), RuleSkipped);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeOrgContext()));
}
