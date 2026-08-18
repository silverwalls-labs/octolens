import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/require-signed-commits.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../../helpers/fixtures.ts';

const REPO = '/repos/sheplu/Octolens';
const PROTECTION = '/repos/sheplu/Octolens/branches/main/protection';

describe('repo-config/require-signed-commits', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when signed commits are required', async () => {
		nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
		nock('https://api.github.com').get(PROTECTION).reply(
			200,
			makeBranchProtectionResponse({
				requirePullRequest: true,
				requireSignedCommits: true,
			}),
		);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when signed commits are not required', async () => {
		nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
		nock('https://api.github.com').get(PROTECTION).reply(
			200,
			makeBranchProtectionResponse({
				requirePullRequest: true,
				requireSignedCommits: false,
			}),
		);

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/require-signed-commits');
		assert.equal(findings[0]?.severity, 'medium');
	});

	test('skips when no protection rule exists', async () => {
		nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
		nock('https://api.github.com').get(PROTECTION).reply(404, { message: 'Branch not protected' });

		await assert.rejects(rule.check(makeContext()), RuleSkipped);
	});

	test('propagates server errors from the API', async () => {
		nock('https://api.github.com')
			.get(REPO)
			.reply(500, { message: 'Internal Server Error' });

		await assert.rejects(rule.check(makeContext()));
	});
});
