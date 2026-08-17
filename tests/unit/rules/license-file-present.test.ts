import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/license-file-present.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

describe('repo-config/license-file-present', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when a license is detected', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ licenseSpdx: 'MIT' }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when no license is set', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ hasLicense: false }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/license-file-present');
		assert.equal(findings[0]?.severity, 'medium');
	});

	test('reports a finding when license SPDX is NOASSERTION', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse({ licenseSpdx: 'NOASSERTION' }));

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
