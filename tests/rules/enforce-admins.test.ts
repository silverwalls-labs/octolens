import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/repo-config/enforce-admins.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when admins are included', enforcedCase);

async function enforcedCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({
			requirePullRequest: true,
			enforceAdmins: true,
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when admins can bypass protection', bypassCase);

async function bypassCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({
			requirePullRequest: true,
			enforceAdmins: false,
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'repo-config/enforce-admins');
	assert.equal(findings[0]?.severity, 'high');
}

test('does not fire when no protection rule exists', noProtectionCase);

async function noProtectionCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}
