import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/repo-config/dismiss-stale-reviews.ts';
import { RuleSkipped } from '../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when stale reviews are dismissed', dismissedCase);

async function dismissedCase() {
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
}

test('reports a finding when stale reviews are kept', keptCase);

async function keptCase() {
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
}

test('does not fire when PRs are not required', noPrCase);

async function noPrCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({ requirePullRequest: false }));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('skips when no protection rule exists', noProtectionCase);

async function noProtectionCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });

	await assert.rejects(rule.check(makeContext()), RuleSkipped);
}
