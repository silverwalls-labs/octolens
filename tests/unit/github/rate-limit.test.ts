import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../../../src/github/fetcher.ts';
import { getRepoTeams } from '../../../src/github/queries.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/teams';
const REPO = { owner: 'sheplu', name: 'Octolens' };

function octokit(): Octokit {
	return new Octokit({
		auth: 'test-token',
		request: { retries: 0 },
	});
}

beforeEach(disableNet);
afterEach(restoreNet);

test('a permission-denied 403 is swallowed as not-checked', permissionCase);

async function permissionCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(403, { message: 'Resource not accessible by integration' });

	const result = await getRepoTeams(octokit(), createCachedFetcher(), REPO);

	assert.equal(result.checked, false);
	assert.deepEqual(result.teams, []);
}

test('a rate-limit 403 (header) propagates as an error', rateLimitHeaderCase);

async function rateLimitHeaderCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(403, { message: 'API rate limit exceeded' }, { 'x-ratelimit-remaining': '0' });

	await assert.rejects(
		getRepoTeams(octokit(), createCachedFetcher(), REPO),
		/rate limit/i,
	);
}

test('a secondary rate-limit 403 (message) propagates as an error', secondaryCase);

async function secondaryCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(403, { message: 'You have exceeded a secondary rate limit' });

	await assert.rejects(
		getRepoTeams(octokit(), createCachedFetcher(), REPO),
		/secondary rate/i,
	);
}

test('a 429 too-many-requests propagates as an error', tooManyCase);

async function tooManyCase() {
	nock('https://api.github.com')
		.get(ENDPOINT)
		.query({ per_page: '100' })
		.reply(429, { message: 'Too Many Requests' });

	await assert.rejects(getRepoTeams(octokit(), createCachedFetcher(), REPO));
}
