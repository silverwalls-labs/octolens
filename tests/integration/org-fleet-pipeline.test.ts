import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import {
	scanOrgAllRepos,
	exitCodeForReport,
	createLogger,
} from '../../src/engine/index.ts';
import { allRules, allOrgRules } from '../../src/rules/index.ts';
import {
	formatJson,
	formatMarkdownReport,
	formatPrettyReport,
} from '../../src/output/index.ts';
import {
	makeOrgActionsPermissionsResponse,
	makeOrgAllowedActionsResponse,
	makeOrgForkPrApprovalResponse,
	makeOrgHooksResponse,
	makeOrgPrivateForkPrResponse,
	makeOrgResponse,
	makeOrgWorkflowPermissionsResponse,
	makeRepoResponse,
} from '../helpers/fixtures.ts';
import type { OrgScanReport } from '../../src/types/index.ts';

const BASE = 'https://api.github.com';
const ORG = 'silverwalls-labs';

function noop() {
	/* intentional no-op */
}

function silentLogger() {
	return {
		debug: noop, info: noop, warn: noop, error: noop,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: 'test-token', request: { retries: 0 } });
}

function mockCompliantOrg(): void {
	nock(BASE).get(`/orgs/${ORG}`).reply(200, makeOrgResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions`)
		.reply(200, makeOrgActionsPermissionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/workflow`)
		.reply(200, makeOrgWorkflowPermissionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/selected-actions`)
		.reply(200, makeOrgAllowedActionsResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-contributor-approval`)
		.reply(200, makeOrgForkPrApprovalResponse());
	nock(BASE).get(`/orgs/${ORG}/actions/permissions/fork-pr-workflows-private-repos`)
		.reply(200, makeOrgPrivateForkPrResponse());
	nock(BASE).get(`/orgs/${ORG}/hooks`)
		.query({ per_page: '100' })
		.reply(200, makeOrgHooksResponse([]));
}

type ListingEntry = {
	name: string;
	archived?: boolean;
	fork?: boolean;
};

function mockListing(entries: ListingEntry[]): void {
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(200, entries.map((e) => ({
			'name': e.name,
			'owner': { login: ORG },
			'archived': e.archived ?? false,
			'fork': e.fork ?? false,
			'private': false,
			'visibility': 'public',
		})));
}

/** Mock every per-repo endpoint a full rule run touches for one repo. */
function mockScannableRepo(name: string): void {
	nock(BASE).get(`/repos/${ORG}/${name}`).reply(200, makeRepoResponse());
	nock(BASE).persist().get(new RegExp(`/repos/${ORG}/${name}/`))
		.reply(200, []);
	nock(BASE).persist().head(new RegExp(`/repos/${ORG}/${name}/`))
		.reply(204);
}

/** Every endpoint of this repo fails persistently. */
function mockBrokenRepo(name: string): void {
	nock(BASE).persist().get(new RegExp(`/repos/${ORG}/${name}`))
		.reply(500, { message: 'server error' });
	nock(BASE).persist().head(new RegExp(`/repos/${ORG}/${name}`))
		.reply(500);
}

/** Catch-all for org-scoped endpoints the repo rules probe (e.g. property schema). */
function mockOrgCatchAll(): void {
	nock(BASE).persist().get(new RegExp(`/orgs/${ORG}/`))
		.reply(404, { message: 'Not Found' });
}

async function runFleetScan(): Promise<OrgScanReport> {
	return scanOrgAllRepos({
		org: ORG,
		orgRules: [ ...allOrgRules ],
		repoRules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
		config: { ignore: { forks: true, repos: [ `${ORG}/unwanted` ] } },
		concurrency: 2,
	});
}

beforeEach(setupCase);

function setupCase() {
	nock.disableNetConnect();
}

afterEach(teardownCase);

function teardownCase() {
	nock.cleanAll();
	nock.enableNetConnect();
}

test('fleet scan covers the org and every eligible repository', fleetScanCase);

async function fleetScanCase() {
	mockCompliantOrg();
	mockListing([
		{ name: 'app' },
		{ name: 'old', archived: true },
		{ name: 'forked', fork: true },
		{ name: 'unwanted' },
	]);
	mockScannableRepo('app');
	mockOrgCatchAll();

	const report = await runFleetScan();

	assert.equal(report.schemaVersion, 1);
	assert.deepEqual(report.target, { type: 'org-fleet', org: ORG });
	assert.equal(report.summary.reposDiscovered, 4);
	assert.equal(report.summary.reposScanned, 1);
	assert.equal(report.summary.reposSkipped, 3);
	assert.equal(report.summary.reposFailed, 0);
	assert.equal(report.summary.listingComplete, true);
	assert.deepEqual(
		report.skipped.map((s) => [ s.repo.name, s.reason ]),
		[
			[ 'forked', 'fork' ],
			[ 'old', 'archived' ],
			[ 'unwanted', 'ignored' ],
		],
	);

	// Org rules plus a full repo-rule run are all accounted for.
	assert.ok(report.org.summary.rulesRun >= 20);
	assert.equal(report.repos.length, 1);
	assert.ok(report.repos[0].summary.rulesRun >= 40);

	// The unprotected mock repo produces findings — exit code reflects that.
	assert.ok(report.summary.findingsTotal > 0);
	assert.equal(exitCodeForReport(report), 1);
}

test('a persistently failing repo never aborts the fleet scan', failingRepoCase);

async function failingRepoCase() {
	mockCompliantOrg();
	mockListing([ { name: 'app' }, { name: 'flaky' } ]);
	mockScannableRepo('app');
	mockBrokenRepo('flaky');
	mockOrgCatchAll();

	const report = await runFleetScan();

	// Every rule of the flaky repo errors, but the scan itself completes.
	assert.equal(report.summary.reposScanned, 2);
	assert.equal(report.summary.reposFailed, 0);
	assert.equal(report.summary.listingComplete, true);

	const flaky = report.repos.find(isFlakyRepo);

	assert.ok(flaky, 'expected the flaky repo in the results');
	assert.ok(flaky.summary.rulesErrored > 0);

	// Incomplete coverage surfaces through --fail-on-skip.
	assert.equal(exitCodeForReport(report, { failOnIncomplete: true }), 1);
}

function isFlakyRepo(result: OrgScanReport['repos'][number]): boolean {
	return result.target.type === 'repo' && result.target.name === 'flaky';
}

test('all three formatters render the fleet report', formattersCase);

async function formattersCase() {
	mockCompliantOrg();
	mockListing([ { name: 'app' } ]);
	mockScannableRepo('app');
	mockOrgCatchAll();

	const report = await runFleetScan();

	const json = JSON.parse(formatJson(report)) as OrgScanReport;

	assert.equal(json.target.type, 'org-fleet');

	const md = formatMarkdownReport(report);

	assert.match(md, /# Octolens scan — silverwalls-labs \(organization fleet\)/);

	const pretty = formatPrettyReport(report, { color: false });

	assert.match(pretty, /Octolens scan — silverwalls-labs \(organization \+ 1 repositories\)/);
	assert.match(pretty, /Repositories: 1 scanned/);
}

test('a failing listing truncates the fleet scan but still reports', truncatedListingCase);

async function truncatedListingCase() {
	mockCompliantOrg();
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(500, { message: 'server error' });
	mockOrgCatchAll();

	const report = await runFleetScan();

	assert.equal(report.summary.listingComplete, false);
	assert.equal(report.summary.reposDiscovered, 0);
	assert.equal(report.summary.reposScanned, 0);

	// Truncation is an incomplete result: strict mode fails, default passes.
	assert.equal(exitCodeForReport(report), 0);
	assert.equal(exitCodeForReport(report, { failOnIncomplete: true }), 1);

	assert.match(formatMarkdownReport(report), /listing incomplete/i);
	assert.match(formatPrettyReport(report, { color: false }), /listing incomplete/i);
	assert.match(formatPrettyReport(report, { color: false }), /No repositories scanned\./);
}

test('a depleted rate budget pauses intake before the next repository', budgetPauseCase);

async function budgetPauseCase() {
	mockCompliantOrg();
	nock(BASE).get(`/orgs/${ORG}/repos`)
		.query({ per_page: '100', type: 'all' })
		.reply(200, [
			{
				'name': 'app',
				'owner': { login: ORG },
				'archived': false,
				'fork': false,
				'private': false,
				'visibility': 'public',
			},
		], {
			'x-ratelimit-remaining': '10',
			'x-ratelimit-reset': '1700000100',
			'x-ratelimit-resource': 'core',
		});
	mockScannableRepo('app');
	mockOrgCatchAll();

	const stderrLines: string[] = [];
	const originalStderr = process.stderr.write.bind(process.stderr);

	process.stderr.write = function spyErr(chunk: string | Uint8Array): boolean {
		if (typeof chunk !== 'string') {
			return originalStderr(chunk);
		}
		stderrLines.push(chunk);

		return true;
	};

	const sleeps: number[] = [];

	async function recordSleep(ms: number): Promise<void> {
		sleeps.push(ms);
	}

	try {
		const report = await scanOrgAllRepos({
			org: ORG,
			orgRules: [ ...allOrgRules ],
			repoRules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: createLogger('info'),
			threshold: 'high',
			concurrency: 2,
			now: () => 1_700_000_000_000,
			sleep: recordSleep,
		});

		assert.equal(report.summary.reposScanned, 1);
	} finally {
		process.stderr.write = originalStderr;
	}

	// 100s until the advertised reset plus the 2s skew margin.
	assert.deepEqual(sleeps, [ 102_000 ]);

	const stderrText = stderrLines.join('');

	assert.match(stderrText, /rate budget low \(10 remaining/);
	assert.match(stderrText, /rate budget window reset; resuming/);
	assert.match(stderrText, /\[info\]|\[warn\]/);
}
