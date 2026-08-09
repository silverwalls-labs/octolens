import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../../src/rules/repo-config/require-conversation-resolution.ts';
import { RuleSkipped } from '../../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../../helpers/fixtures.ts';

beforeEach(disableNet);
afterEach(restoreNet);

test('reports no findings when conversation resolution is required', requiredCase);

async function requiredCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({
			requirePullRequest: true,
			requireConversationResolution: true,
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when conversation resolution is not required', missingCase);

async function missingCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, makeBranchProtectionResponse({
			requirePullRequest: true,
			requireConversationResolution: false,
		}));

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'repo-config/require-conversation-resolution');
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

test('propagates server errors from the API', serverErrorCase);

async function serverErrorCase() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(500, { message: 'Internal Server Error' });

	await assert.rejects(rule.check(makeContext()));
}
