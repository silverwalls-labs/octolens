import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/access/outside-collaborator-count.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/collaborators';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when no outside collaborators exist', emptyCase);

async function emptyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ affiliation: 'outside', per_page: '100' })
		.reply(200, []);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when outside collaborators exist', presentCase);

async function presentCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ affiliation: 'outside', per_page: '100' })
		.reply(200, [
			{
				login: 'contractor1',
				role_name: 'write',
				permissions: { push: true },
			},
			{
				login: 'contractor2',
				role_name: 'read',
				permissions: { pull: true },
			},
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/outside-collaborator-count');
	assert.equal(findings[0]?.severity, 'low');
	assert.match(findings[0]?.detail ?? '', /contractor1.*contractor2/);
}

test('reports no findings when collaborator endpoint returns 403', forbiddenCase);

async function forbiddenCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ affiliation: 'outside', per_page: '100' })
		.reply(403, { message: 'Forbidden' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ affiliation: 'outside', per_page: '100' })
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
