import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/repo-config/require-status-checks.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when status checks are required', requiredCase);

async function requiredCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({
			requirePullRequest: true,
			statusCheckContexts: [ 'ci/test' ],
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when no status checks are required', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({ requirePullRequest: true }));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'repo-config/require-status-checks');
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
