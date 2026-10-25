import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../../../src/github/fetcher.ts';
import {
	getActionsPermissions, getCodeScanningStatus, getDefaultWorkflowPermissions,
	getOrgActionsPermissions, getRepoTeams,
} from '../../../src/github/queries.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';

const ENDPOINT = '/repos/sheplu/Octolens/teams';
const ORG_ENDPOINT =
	'/orgs/silverwalls-labs/actions/permissions';
const REPO = { owner: 'sheplu', name: 'Octolens' };
const ORG = 'silverwalls-labs';

describe('rate-limit handling', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test(
		'a permission-denied 403 is swallowed as not-checked',
		async () => {
			nock('https://api.github.com')
				.get(ENDPOINT)
				.query({ per_page: '100' })
				.reply(403, {
					message: 'Resource not accessible by integration',
				});

			const result = await getRepoTeams(octokit(), createCachedFetcher(), REPO);

			assert.equal(result.checked, false);
			assert.deepEqual(result.teams, []);
		},
	);

	test(
		'a rate-limit 403 (header) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get(ENDPOINT)
				.query({ per_page: '100' })
				.reply(
					403,
					{ message: 'API rate limit exceeded' },
					{ 'x-ratelimit-remaining': '0' },
				);

			await assert.rejects(
				getRepoTeams(octokit(), createCachedFetcher(), REPO),
				/rate limit/i,
			);
		},
	);

	test(
		'a secondary rate-limit 403 (message) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get(ENDPOINT)
				.query({ per_page: '100' })
				.reply(403, {
					message: 'You have exceeded a secondary rate limit',
				});

			await assert.rejects(
				getRepoTeams(octokit(), createCachedFetcher(), REPO),
				/secondary rate/i,
			);
		},
	);

	test(
		'a 429 too-many-requests propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get(ENDPOINT)
				.query({ per_page: '100' })
				.reply(429, { message: 'Too Many Requests' });

			await assert.rejects(getRepoTeams(octokit(), createCachedFetcher(), REPO));
		},
	);

	test(
		'org fetcher: a permission-denied 403 is swallowed as not-checked',
		async () => {
			nock('https://api.github.com')
				.get(ORG_ENDPOINT)
				.reply(403, {
					message: 'Must have admin rights',
				});

			const result = await getOrgActionsPermissions(octokit(), createCachedFetcher(), ORG);

			assert.equal(result.checked, false);
			assert.equal(result.allowedActions, null);
		},
	);

	test(
		'org fetcher: a rate-limit 403 (header) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get(ORG_ENDPOINT)
				.reply(
					403,
					{ message: 'API rate limit exceeded' },
					{ 'x-ratelimit-remaining': '0' },
				);

			await assert.rejects(
				getOrgActionsPermissions(octokit(), createCachedFetcher(), ORG),
				/rate limit/i,
			);
		},
	);

	test(
		'org fetcher: a 429 too-many-requests propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get(ORG_ENDPOINT)
				.reply(429, { message: 'Too Many Requests' });

			await assert.rejects(getOrgActionsPermissions(octokit(), createCachedFetcher(), ORG));
		},
	);

	test(
		'code scanning: a rate-limit 403 (header) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/code-scanning/analyses')
				.query(true)
				.reply(
					403,
					{ message: 'API rate limit exceeded' },
					{ 'x-ratelimit-remaining': '0' },
				);

			await assert.rejects(
				getCodeScanningStatus(octokit(), createCachedFetcher(), REPO),
				/rate limit/i,
			);
		},
	);

	test(
		'actions permissions: a rate-limit 403 (header) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/actions/permissions')
				.reply(
					403,
					{ message: 'API rate limit exceeded' },
					{ 'x-ratelimit-remaining': '0' },
				);

			await assert.rejects(
				getActionsPermissions(octokit(), createCachedFetcher(), REPO),
				/rate limit/i,
			);
		},
	);

	test(
		'default workflow permissions: a rate-limit 403 (header) propagates as an error',
		async () => {
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/actions/permissions/workflow')
				.reply(
					403,
					{ message: 'API rate limit exceeded' },
					{ 'x-ratelimit-remaining': '0' },
				);

			await assert.rejects(
				getDefaultWorkflowPermissions(octokit(), createCachedFetcher(), REPO),
				/rate limit/i,
			);
		},
	);
});

function octokit(): Octokit {
	return new Octokit({
		auth: 'test-token',
		request: { retries: 0 },
	});
}
