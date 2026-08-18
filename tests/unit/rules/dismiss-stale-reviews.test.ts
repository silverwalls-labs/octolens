import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/dismiss-stale-reviews.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../../helpers/fixtures.ts';

describe('repo-config/dismiss-stale-reviews', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test('reports no findings when stale reviews are dismissed', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(200, makeBranchProtectionResponse({
				requirePullRequest: true,
				dismissStaleReviews: true,
			}));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
	});

	test('reports a finding when stale reviews are kept', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(200, makeBranchProtectionResponse({
				requirePullRequest: true,
				dismissStaleReviews: false,
			}));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 1);
		assert.equal(findings[0]?.ruleId, 'repo-config/dismiss-stale-reviews');
	});

	test('does not fire when PRs are not required', async () => {
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens')
			.reply(200, makeRepoResponse());
		nock('https://api.github.com')
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(200, makeBranchProtectionResponse({ requirePullRequest: false }));

		const findings = await rule.check(makeContext());

		assert.equal(findings.length, 0);
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
