import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import {
	getBranchProtection,
	getDeployKeys,
	getDirectCollaborators,
	getOrgAllowedActions,
	getOrgMetadata,
	getPrivateVulnerabilityReporting,
	getRepoCustomPropertyValues,
	getRepoRunners,
	getRepoWebhooks,
	isRateLimited,
} from '../../../src/github/queries.ts';
import { createCachedFetcher } from '../../../src/github/fetcher.ts';

const BASE = 'https://api.github.com';
const REPO = { owner: 'sheplu', name: 'Octolens' };

beforeEach(disableNet);

function disableNet() {
	nock.disableNetConnect();
}

afterEach(restoreNet);

function restoreNet() {
	nock.cleanAll();
	nock.enableNetConnect();
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: 't', request: { retries: 0 } });
}

test('custom property values return null on 404', propertyValues404);

async function propertyValues404() {
	nock(BASE).get('/repos/sheplu/Octolens/properties/values').reply(404);

	const values = await getRepoCustomPropertyValues(makeOctokit(), createCachedFetcher(), REPO);

	assert.equal(values, null);
}

test('custom property values return null on permission-denied 403', propertyValues403);

async function propertyValues403() {
	nock(BASE)
		.get('/repos/sheplu/Octolens/properties/values')
		.reply(403, { message: 'Resource not accessible by personal access token' });

	const values = await getRepoCustomPropertyValues(makeOctokit(), createCachedFetcher(), REPO);

	assert.equal(values, null);
}

test('custom property values propagate server errors', propertyValues500);

async function propertyValues500() {
	nock(BASE).get('/repos/sheplu/Octolens/properties/values').reply(500);

	await assert.rejects(getRepoCustomPropertyValues(makeOctokit(), createCachedFetcher(), REPO));
}

test('custom property values propagate rate-limited 403s', propertyValuesRateLimited);

async function propertyValuesRateLimited() {
	nock(BASE)
		.get('/repos/sheplu/Octolens/properties/values')
		.reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });

	await assert.rejects(getRepoCustomPropertyValues(makeOctokit(), createCachedFetcher(), REPO));
}

test('collaborator permissions fall back to the legacy permissions object', legacyPermissions);

async function legacyPermissions() {
	nock(BASE)
		.get('/repos/sheplu/Octolens/collaborators')
		.query(true)
		.reply(200, [
			{ login: 'a', permissions: { admin: true } },
			{ login: 'b', permissions: { maintain: true } },
			{ login: 'c', permissions: { push: true } },
			{ login: 'd', permissions: { triage: true } },
			{ login: 'e', permissions: { pull: true } },
			{ login: 'f' },
			{ login: 'g', role_name: 'write' },
		]);

	const collaborators = await getDirectCollaborators(makeOctokit(), createCachedFetcher(), REPO);

	assert.deepEqual(collaborators.map(toPermission), [
		'admin',
		'maintain',
		'write',
		'triage',
		'read',
		'read',
		'write',
	]);
}

function toPermission(collaborator: { permission: string; }): string {
	return collaborator.permission;
}

test('org metadata tolerates a minimal payload', minimalOrgMetadata);

async function minimalOrgMetadata() {
	nock(BASE).get('/orgs/silverwalls-labs').reply(200, { login: 'silverwalls-labs' });

	const meta = await getOrgMetadata(makeOctokit(), createCachedFetcher(), 'silverwalls-labs');

	assert.equal(meta.login, 'silverwalls-labs');
	assert.equal(meta.publicRepos, null);
	assert.equal(meta.totalPrivateRepos, null);
	assert.equal(meta.twoFactorRequirementEnabled, undefined);
	assert.equal(meta.defaultRepositoryPermission, undefined);
	assert.equal(meta.membersCanCreatePublicRepositories, undefined);
}

test('webhook insecure_ssl accepts numeric values', numericInsecureSsl);

async function numericInsecureSsl() {
	nock(BASE)
		.get('/repos/sheplu/Octolens/hooks')
		.query(true)
		.reply(200, [
			{ id: 1, config: { url: 'https://example.com', insecure_ssl: 1 } },
			{ id: 2, config: { url: 'https://example.com', insecure_ssl: 0 } },
			{ id: 3, config: { url: 'https://example.com', insecure_ssl: 'TRUE' } },
			{ id: 4 },
		]);

	const webhooks = await getRepoWebhooks(makeOctokit(), createCachedFetcher(), REPO);

	assert.deepEqual(webhooks.map(toInsecure), [
		true,
		false,
		true,
		false,
	]);
	assert.equal(webhooks[3].url, '');
}

function toInsecure(hook: { insecureSsl: boolean; }): boolean {
	return hook.insecureSsl;
}

test('branch protection propagates server errors', branchProtection500);

async function branchProtection500() {
	nock(BASE).get('/repos/sheplu/Octolens/branches/main/protection').reply(500);

	await assert.rejects(getBranchProtection(makeOctokit(), createCachedFetcher(), REPO, 'main'));
}

test('vulnerability reporting propagates server errors', pvr500);

async function pvr500() {
	nock(BASE).get('/repos/sheplu/Octolens/private-vulnerability-reporting').reply(500);

	const pending = getPrivateVulnerabilityReporting(makeOctokit(), createCachedFetcher(), REPO);

	await assert.rejects(pending);
}

test('runner listing propagates server errors', runners500);

async function runners500() {
	nock(BASE).get('/repos/sheplu/Octolens/actions/runners')
		.query(true)
		.reply(500);

	await assert.rejects(getRepoRunners(makeOctokit(), createCachedFetcher(), REPO));
}

test('webhook listing propagates server errors', webhooks500);

async function webhooks500() {
	nock(BASE).get('/repos/sheplu/Octolens/hooks')
		.query(true)
		.reply(500);

	await assert.rejects(getRepoWebhooks(makeOctokit(), createCachedFetcher(), REPO));
}

test('deploy key listing propagates server errors', deployKeys500);

async function deployKeys500() {
	nock(BASE).get('/repos/sheplu/Octolens/keys')
		.query(true)
		.reply(500);

	await assert.rejects(getDeployKeys(makeOctokit(), createCachedFetcher(), REPO));
}

test('webhook listing returns empty on 404', webhooks404);

async function webhooks404() {
	nock(BASE).get('/repos/sheplu/Octolens/hooks')
		.query(true)
		.reply(404);

	const webhooks = await getRepoWebhooks(makeOctokit(), createCachedFetcher(), REPO);

	assert.deepEqual(webhooks, []);
}

test('deploy key listing returns empty on 404', deployKeys404);

async function deployKeys404() {
	nock(BASE).get('/repos/sheplu/Octolens/keys')
		.query(true)
		.reply(404);

	const keys = await getDeployKeys(makeOctokit(), createCachedFetcher(), REPO);

	assert.deepEqual(keys, []);
}

test('org allowed-actions propagate server errors', orgAllowedActions500);

async function orgAllowedActions500() {
	nock(BASE).get('/orgs/silverwalls-labs/actions/permissions/selected-actions').reply(500);

	const pending = getOrgAllowedActions(makeOctokit(), createCachedFetcher(), 'silverwalls-labs');

	await assert.rejects(pending);
}

test('isRateLimited classifies rate-limit signals', rateLimitClassification);

function rateLimitClassification() {
	assert.equal(isRateLimited({ status: 429 }), true);
	assert.equal(isRateLimited({ status: 500 }), false);
	assert.equal(isRateLimited('not an object'), false);
	assert.equal(isRateLimited({
		status: 403,
		response: { headers: { 'x-ratelimit-remaining': '0' } },
	}), true);
	assert.equal(isRateLimited({
		status: 403,
		response: { headers: { 'retry-after': '30' } },
	}), true);
	assert.equal(isRateLimited({ status: 403, message: 'API rate limit exceeded' }), true);
	assert.equal(isRateLimited({ status: 403, message: 'secondary rate limit hit' }), true);
	assert.equal(isRateLimited({ status: 403, message: 'abuse detection triggered' }), true);
	assert.equal(isRateLimited({ status: 403, message: 'Forbidden' }), false);
	assert.equal(isRateLimited({ status: 403, message: 42 }), false);
	assert.equal(isRateLimited({ status: 403 }), false);
}
