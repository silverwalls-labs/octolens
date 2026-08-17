import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/require-pull-request.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../../helpers/fixtures.ts';

describe('repo-config/require-pull-request', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when PRs are required', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(200, makeBranchProtectionResponse({ requirePullRequest: true }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when PRs are not required', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(200, makeBranchProtectionResponse({ requirePullRequest: false }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/require-pull-request');
		assert.equal(findings[0]?.severity, 'high');
	});

	test('skips when no protection rule exists', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(404, { message: 'Branch not protected' });

		await assert.rejects(rule.check(makeContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
