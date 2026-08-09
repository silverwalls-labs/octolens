import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { rule } from '../../src/rules/access/require-code-owner-reviews.ts';
import { RuleSkipped } from '../../src/types/index.ts';
import {
	disableNet, makeContext, restoreNet,
} from '../helpers/context.ts';
import {
	makeBranchProtectionResponse,
	makeRepoResponse,
} from '../helpers/fixtures.ts';

const CODEOWNERS_ROOT = '/repos/sheplu/Octolens/contents/CODEOWNERS';
const CODEOWNERS_GITHUB = '/repos/sheplu/Octolens/contents/.github%2FCODEOWNERS';
const CODEOWNERS_DOCS = '/repos/sheplu/Octolens/contents/docs%2FCODEOWNERS';
const REPO = '/repos/sheplu/Octolens';
const PROTECTION = '/repos/sheplu/Octolens/branches/main/protection';

beforeEach(disableNet);
afterEach(restoreNet);

test('does not fire when no CODEOWNERS file is present', noCodeownersCase);

async function noCodeownersCase() {
	nock('https://api.github.com').get(CODEOWNERS_ROOT).reply(404);
	nock('https://api.github.com').get(CODEOWNERS_GITHUB).reply(404);
	nock('https://api.github.com').get(CODEOWNERS_DOCS).reply(404);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports no findings when code owner reviews are required', requiredCase);

async function requiredCase() {
	nock('https://api.github.com').get(CODEOWNERS_ROOT).reply(200, {
		name: 'CODEOWNERS', path: 'CODEOWNERS', type: 'file',
	});
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com').get(PROTECTION).reply(
		200,
		makeBranchProtectionResponse({
			requirePullRequest: true,
			requireCodeOwnerReviews: true,
		}),
	);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 0);
}

test('reports a finding when CODEOWNERS exists but reviews are not required', missingCase);

async function missingCase() {
	nock('https://api.github.com').get(CODEOWNERS_ROOT).reply(200, {
		name: 'CODEOWNERS', path: 'CODEOWNERS', type: 'file',
	});
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com').get(PROTECTION).reply(
		200,
		makeBranchProtectionResponse({
			requirePullRequest: true,
			requireCodeOwnerReviews: false,
		}),
	);

	const findings = await rule.check(makeContext());

	assert.equal(findings.length, 1);
	assert.equal(findings[0]?.ruleId, 'access/require-code-owner-reviews');
	assert.equal(findings[0]?.severity, 'medium');
}

test('skips when no protection rule exists', noProtectionCase);

async function noProtectionCase() {
	nock('https://api.github.com').get(CODEOWNERS_ROOT).reply(200, {
		name: 'CODEOWNERS', path: 'CODEOWNERS', type: 'file',
	});
	nock('https://api.github.com').get(REPO).reply(200, makeRepoResponse());
	nock('https://api.github.com').get(PROTECTION).reply(404, { message: 'Branch not protected' });

	await assert.rejects(rule.check(makeContext()), RuleSkipped);
}
