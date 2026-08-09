import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/visibility-private-default.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';

const RULE_ID = 'access/visibility-private-default';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when the repo is private', privateCase);

async function privateCase() {
	mockMeta({ visibility: 'private' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when the repo is public and not allowed', publicNotAllowedCase);

async function publicNotAllowedCase() {
	mockMeta({ visibility: 'public' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, RULE_ID);
	assert.equal(findings[0]?.severity, 'medium');
	assert.match(findings[0]?.title ?? '', /public/);
}

test('reports no findings when the repo is public and on allow-public', publicAllowedCase);

async function publicAllowedCase() {
	mockMeta({ visibility: 'public' });

	const findings = await rule.check(makeContext({
		ruleConfig: {
			[RULE_ID]: {
				allowPublic: [ 'sheplu/octolens' ],
				allowInternal: [],
			},
		},
	}));

	assert.equal(findings.length, 0);
}

test('reports a finding when the repo is internal and not allowed', internalNotAllowedCase);

async function internalNotAllowedCase() {
	mockMeta({ visibility: 'internal' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, RULE_ID);
	assert.match(findings[0]?.title ?? '', /internal/);
}

test('reports no findings when the repo is internal and on allow-internal', internalAllowedCase);

async function internalAllowedCase() {
	mockMeta({ visibility: 'internal' });

	const findings = await rule.check(makeContext({
		ruleConfig: {
			[RULE_ID]: {
				allowPublic: [],
				allowInternal: [ 'sheplu/octolens' ],
			},
		},
	}));

	assert.equal(findings.length, 0);
}

test('public allowlist does not exempt internal repos', crossListCase);

async function crossListCase() {
	mockMeta({ visibility: 'internal' });

	const findings = await rule.check(makeContext({
		ruleConfig: {
			[RULE_ID]: {
				allowPublic: [ 'sheplu/octolens' ],
				allowInternal: [],
			},
		},
	}));

	assert.equal(findings.length, 1);
}

function mockMeta(opts: { visibility: 'public' | 'private' | 'internal'; }) {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse({ visibility: opts.visibility }));
}

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
