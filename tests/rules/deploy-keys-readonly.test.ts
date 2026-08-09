import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/deploy-keys-readonly.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/keys';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when no deploy keys exist', emptyCase);

async function emptyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, []);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when all deploy keys are read-only', readOnlyCase);

async function readOnlyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, [
			{
				id: 1, title: 'ci-deployer', read_only: true,
			},
			{
				id: 2, title: 'release-bot', read_only: true,
			},
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when deploy keys allow writes', writableCase);

async function writableCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(200, [
			{
				id: 1, title: 'old-write-key', read_only: false,
			},
			{
				id: 2, title: 'safe-key', read_only: true,
			},
		]);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/deploy-keys-readonly');
	assert.equal(findings[0]?.severity, 'medium');
	assert.match(findings[0]?.detail ?? '', /old-write-key/);
	assert.doesNotMatch(findings[0]?.detail ?? '', /safe-key/);
}
