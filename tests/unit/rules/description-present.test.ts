import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/description-present.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

describe('repo-config/description-present', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when a description is set', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ description: 'A GitHub security auditor' }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when description is null', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ description: null }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/description-present');
		assert.equal(findings[0]?.severity, 'info');
	});

	test('reports a finding when description is empty whitespace', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ description: '   ' }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
