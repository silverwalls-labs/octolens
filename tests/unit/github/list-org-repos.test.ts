import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { listOrgRepos, type OrgRepoListing } from '../../../src/github/queries.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';

const BASE = 'https://api.github.com';
const ORG = 'silverwalls-labs';

function makeOctokit(): Octokit {
	return new Octokit({ auth: 'test-token', request: { retries: 0 } });
}

type ListingFixture = {
	'name': string;
	'archived'?: boolean;
	'fork'?: boolean;
	'visibility'?: string;
	'private'?: boolean;
};

function makeListingEntry(options: ListingFixture): Record<string, unknown> {
	return {
		'name': options.name,
		'full_name': `${ORG}/${options.name}`,
		'owner': { login: ORG },
		'archived': options.archived ?? false,
		'fork': options.fork ?? false,
		'private': options.private ?? false,
		'visibility': options.visibility ?? 'public',
	};
}

async function collect(octokit: Octokit): Promise<OrgRepoListing[]> {
	const entries: OrgRepoListing[] = [];

	for await (const entry of listOrgRepos(octokit, ORG)) {
		entries.push(entry);
	}

	return entries;
}

beforeEach(disableNet);
afterEach(restoreNet);

test('streams and maps a single page of repositories', testSinglePage);

async function testSinglePage() {
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(200, [
			makeListingEntry({ name: 'alpha' }),
			makeListingEntry({
				'name': 'beta',
				'archived': true,
				'fork': true,
				'visibility': 'private',
				'private': true,
			}),
		]);

	const entries = await collect(makeOctokit());

	assert.deepEqual(entries, [
		{
			owner: ORG, name: 'alpha', archived: false, fork: false, visibility: 'public',
		},
		{
			owner: ORG, name: 'beta', archived: true, fork: true, visibility: 'private',
		},
	]);
}

test('follows pagination across pages', testPagination);

async function testPagination() {
	const nextLink = `<${BASE}/orgs/${ORG}/repos?per_page=100&type=all&page=2>; rel="next"`;

	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(200, [ makeListingEntry({ name: 'page-one' }) ], { link: nextLink });
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({
			per_page: '100', type: 'all', page: '2',
		})
		.reply(200, [ makeListingEntry({ name: 'page-two' }) ]);

	const entries = await collect(makeOctokit());

	assert.deepEqual(entries.map((e) => e.name), [ 'page-one', 'page-two' ]);
}

test('propagates listing errors to the caller', testListingError);

async function testListingError() {
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(500, { message: 'boom' });

	await assert.rejects(collect(makeOctokit()));
}
