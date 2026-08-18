import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/topics-present.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

describe('repo-config/topics-present', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when topics exist', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ topics: [ 'security', 'cli' ] }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when no topics are set', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ topics: [] }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/topics-present');
		assert.equal(findings[0]?.severity, 'info');
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
