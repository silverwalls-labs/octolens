import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/cicd/forbid-self-hosted-runners-on-public-repos.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

const REPO = '/repos/sheplu/Octolens';
const RUNNERS = '/repos/sheplu/Octolens/actions/runners';

beforeEach(disableNet);
afterEach(restoreNet);

test('does not fire on private repos', privateCase);

async function privateCase() {
	nock('https://api.github.com')
		.get(REPO)
		.reply(200, makeRepoResponse({ 'private': true }));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings on a public repo with no runners', emptyCase);

async function emptyCase() {
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get(RUNNERS)
		.query({ per_page: '100' })
		.reply(200, { total_count: 0, runners: [] });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when public repo has self-hosted runners', presentCase);

async function presentCase() {
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get(RUNNERS)
		.query({ per_page: '100' })
		.reply(200, {
			total_count: 1,
			runners: [
				{
					id: 1,
					name: 'self-hosted-1',
					labels: [ { name: 'self-hosted' } ],
				},
			],
		});

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'cicd/forbid-self-hosted-runners-on-public-repos');
	assert.equal(findings[0]?.severity, 'high');
	assert.match(findings[0]?.detail ?? '', /self-hosted-1/);
}

test('skips when runners endpoint returns a permission 403', forbiddenCase);

async function forbiddenCase() {
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get(RUNNERS)
		.query({ per_page: '100' })
		.reply(403, { message: 'Forbidden' });

	await assert.rejects(rule.check(makeContext()), RuleSkipped);
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get(REPO)
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
