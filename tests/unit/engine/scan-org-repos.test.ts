import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { scanOrgAllRepos, repoFilterReason } from '../../../src/engine/scan-org-repos.ts';
import { getOrgCustomPropertySchema, type OrgRepoListing } from '../../../src/github/queries.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';
import { makeOrgResponse, makeRepoResponse } from '../../helpers/fixtures.ts';
import type {
	Finding, Logger, Rule, RuleContext,
} from '../../../src/types/index.ts';

const BASE = 'https://api.github.com';
const ORG = 'silverwalls-labs';

function noop() {
	/* intentional no-op */
}

function silentLogger(): Logger {
	return {
		debug: noop, info: noop, warn: noop, error: noop,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: 'test-token', request: { retries: 0 } });
}

function makeListingEntry(overrides: Partial<OrgRepoListing> & { name: string; }): OrgRepoListing {
	return {
		owner: ORG,
		archived: false,
		fork: false,
		visibility: 'public',
		...overrides,
	};
}

function toListingResponse(entries: OrgRepoListing[]): Record<string, unknown>[] {
	return entries.map((entry) => ({
		'name': entry.name,
		'owner': { login: entry.owner },
		'archived': entry.archived,
		'fork': entry.fork,
		'private': entry.visibility !== 'public',
		'visibility': entry.visibility,
	}));
}

/** A rule that reads the org custom-property schema through the scan cache. */
const SCHEMA_RULE: Rule = {
	id: 'test/schema-rule',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'test rule reading org-scoped data',
	docs: 'Reads the org custom-property schema through the scan cache.',
	async check(ctx: RuleContext): Promise<Finding[]> {
		await getOrgCustomPropertySchema(ctx.octokit, ctx.cache, ORG);

		return [];
	},
};

/** A rule that flags every repository it sees. */
const FLAGGING_RULE: Rule = {
	id: 'test/always-flag',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'test rule producing one finding per repo',
	docs: 'Flags every repository it sees.',
	async check(ctx: RuleContext): Promise<Finding[]> {
		return [
			{
				ruleId: 'test/always-flag',
				severity: 'high',
				repo: ctx.repo,
				title: 'flagged',
			},
		];
	},
};

/** A rule whose malformed return value makes the whole repo scan throw. */
const BROKEN_RULE: Rule = {
	id: 'test/broken-rule',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'test rule that breaks the scan for one repo',
	docs: 'Returns a malformed findings value for the repo named "broken".',
	async check(ctx: RuleContext): Promise<Finding[]> {
		return ctx.repo.name === 'broken' ?
			(null as unknown as Finding[]) :
			[];
	},
};

function mockOrgAndListing(entries: OrgRepoListing[]): void {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse({ privileged: false }));
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(200, toListingResponse(entries));
}

function mockRepoMetadata(names: string[]): void {
	for (const name of names) {
		nock(BASE).get(`/repos/${ORG}/${name}`).reply(200, makeRepoResponse());
	}
}

beforeEach(disableNet);
afterEach(restoreNet);

test('repoFilterReason skips archived repos by default', testFilterArchived);

function testFilterArchived() {
	const entry = makeListingEntry({ name: 'old', archived: true });

	assert.equal(repoFilterReason(entry), 'archived');
	assert.equal(repoFilterReason(entry, { ignore: { archived: true } }), 'archived');
	assert.equal(repoFilterReason(entry, { ignore: { archived: false } }), null);
}

test('repoFilterReason skips forks only when configured', testFilterForks);

function testFilterForks() {
	const entry = makeListingEntry({ name: 'forked', fork: true });

	assert.equal(repoFilterReason(entry), null);
	assert.equal(repoFilterReason(entry, { ignore: { forks: true } }), 'fork');
	assert.equal(repoFilterReason(entry, { ignore: { forks: false } }), null);
}

test('repoFilterReason matches the ignore list case-insensitively', testFilterIgnoreList);

function testFilterIgnoreList() {
	const entry = makeListingEntry({ name: 'Sandbox' });
	const config = { ignore: { repos: [ `${ORG}/sandbox` ] } };

	assert.equal(repoFilterReason(entry, config), 'ignored');
	assert.equal(repoFilterReason(makeListingEntry({ name: 'other' }), config), null);
}

test('fleet scan aggregates org and repo results', testAggregates);

async function testAggregates() {
	mockOrgAndListing([
		makeListingEntry({ name: 'beta' }),
		makeListingEntry({ name: 'alpha' }),
		makeListingEntry({ name: 'old', archived: true }),
	]);
	mockRepoMetadata([ 'alpha', 'beta' ]);

	const report = await scanOrgAllRepos({
		org: ORG,
		orgRules: [],
		repoRules: [ FLAGGING_RULE ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(report.schemaVersion, 1);
	assert.deepEqual(report.target, { type: 'org-fleet', org: ORG });
	assert.equal(report.summary.reposDiscovered, 3);
	assert.equal(report.summary.reposScanned, 2);
	assert.equal(report.summary.reposSkipped, 1);
	assert.equal(report.summary.reposFailed, 0);
	assert.equal(report.summary.listingComplete, true);
	assert.equal(report.summary.findingsTotal, 2);
	assert.equal(report.summary.findingsBySeverity.high, 2);
	assert.deepEqual(report.skipped, [ { repo: { owner: ORG, name: 'old' }, reason: 'archived' } ]);

	// Results are sorted by owner/name regardless of completion order.
	const names = report.repos.map((r) => (r.target.type === 'repo' ?
		r.target.name :
		''));

	assert.deepEqual(names, [ 'alpha', 'beta' ]);
}

test('a repo whose scan fails is recorded and the fleet scan continues', testFailureRecorded);

async function testFailureRecorded() {
	mockOrgAndListing([
		makeListingEntry({ name: 'broken' }),
		makeListingEntry({ name: 'healthy' }),
	]);
	mockRepoMetadata([ 'broken', 'healthy' ]);

	const report = await scanOrgAllRepos({
		org: ORG,
		orgRules: [],
		repoRules: [ BROKEN_RULE ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(report.summary.reposScanned, 1);
	assert.equal(report.summary.reposFailed, 1);
	assert.equal(report.failures.length, 1);
	assert.deepEqual(report.failures[0].repo, { owner: ORG, name: 'broken' });
	assert.equal(report.summary.listingComplete, true);
}

test('a listing error truncates the scan instead of crashing', testListingErrorTruncates);

async function testListingErrorTruncates() {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse({ privileged: false }));
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(500, { message: 'boom' });

	const report = await scanOrgAllRepos({
		org: ORG,
		orgRules: [],
		repoRules: [ FLAGGING_RULE ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(report.summary.listingComplete, false);
	assert.equal(report.summary.reposDiscovered, 0);
	assert.equal(report.summary.reposScanned, 0);
}

test('org-scoped data is fetched once and shared across repo scans', testSharedOrgCache);

async function testSharedOrgCache() {
	mockOrgAndListing([
		makeListingEntry({ name: 'one' }),
		makeListingEntry({ name: 'two' }),
	]);
	mockRepoMetadata([ 'one', 'two' ]);

	// A single (non-persisted) interceptor: a second request would fail.
	nock(BASE).get(`/orgs/${ORG}/properties/schema`).reply(200, []);

	const report = await scanOrgAllRepos({
		org: ORG,
		orgRules: [],
		repoRules: [ SCHEMA_RULE ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(report.summary.reposScanned, 2);
	assert.equal(report.summary.rulesErrored, 0);
	assert.ok(nock.isDone(), 'expected every mocked endpoint to be consumed exactly once');
}
