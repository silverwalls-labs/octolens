import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/forbid-forking-private-repos.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

const RULE_ID = 'repo-config/forbid-forking-private-repos';
const REPO = '/repos/sheplu/Octolens';

describe('repo-config/forbid-forking-private-repos', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when a public repo allows forking', async () => {
		mockMeta({ visibility: 'public', allowForking: true });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports no findings when a private repo forbids forking', async () => {
		mockMeta({ visibility: 'private', allowForking: false });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when a private repo allows forking', async () => {
		mockMeta({ visibility: 'private', allowForking: true });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, RULE_ID);
		assert.equal(findings[0]?.severity, 'high');
		assert.match(findings[0]?.title ?? '', /private/);
	});

	test('reports a finding when an internal repo allows forking', async () => {
		mockMeta({ visibility: 'internal', allowForking: true });

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, RULE_ID);
		assert.match(findings[0]?.title ?? '', /internal/);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(REPO)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});

function mockMeta(opts: {
	visibility: 'public' | 'private' | 'internal';
	allowForking: boolean;
}) {
	nock('https://api.github.com')
		.get(REPO)
		.reply(200, makeRepoResponse({
			visibility: opts.visibility,
			allowForking: opts.allowForking,
		}));
}
