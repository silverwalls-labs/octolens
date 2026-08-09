import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import {
	scanRepo,
	exitCodeFor,
} from '../../src/engine/index.ts';
import { allRules } from '../../src/rules/index.ts';
import {
	formatJson,
	formatMarkdown,
	formatPretty,
} from '../../src/output/index.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';
import type { ScanResult } from '../../src/types/index.ts';

const BASE = 'https://api.github.com';

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

function mockRepoMetadata(): void {
	nock(BASE).get('/repos/sheplu/Octolens').reply(200, makeRepoResponse());
}

function mockProtected(): void {
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(200, {
			url: `${BASE}/repos/sheplu/Octolens/branches/main/protection`,
			required_pull_request_reviews: { required_approving_review_count: 1 },
			enforce_admins: { enabled: true },
			required_linear_history: { enabled: false },
			allow_force_pushes: { enabled: false },
			required_conversation_resolution: { enabled: false },
			required_signatures: { enabled: false },
		});
}

function mockCatchAll(): void {
	nock(BASE).persist().get(/\/repos\/sheplu\/Octolens\//)
		.reply(200, []);
	nock(BASE).persist().head(/\/repos\/sheplu\/Octolens\//)
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404);
}

async function runFullScan(): Promise<ScanResult> {
	return scanRepo({
		repo: { owner: 'sheplu', name: 'Octolens' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
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

test('full scan with all rules produces valid results', fullScanCase);

async function fullScanCase() {
	mockRepoMetadata();
	mockProtected();
	mockCatchAll();

	const result = await runFullScan();

	assert.equal(result.schemaVersion, 1);
	assert.equal(result.target.owner, 'sheplu');
	assert.ok(result.summary.rulesRun >= 40);
	assert.ok(result.summary.rulesErrored <= result.summary.rulesRun);
}

test('JSON formatter produces parseable output from full scan', jsonFormatCase);

async function jsonFormatCase() {
	mockRepoMetadata();
	mockProtected();
	mockCatchAll();

	const result = await runFullScan();
	const json = formatJson(result);
	const parsed = JSON.parse(json);

	assert.equal(parsed.schemaVersion, 1);
	assert.equal(parsed.target.owner, 'sheplu');
	assert.equal(typeof parsed.summary.rulesRun, 'number');
}

test('markdown formatter produces valid output from full scan', markdownFormatCase);

async function markdownFormatCase() {
	mockRepoMetadata();
	mockProtected();
	mockCatchAll();

	const result = await runFullScan();
	const md = formatMarkdown(result);

	assert.match(md, /# Octolens scan — sheplu\/Octolens/);
}

test('pretty formatter produces valid output from full scan', prettyFormatCase);

async function prettyFormatCase() {
	mockRepoMetadata();
	mockProtected();
	mockCatchAll();

	const result = await runFullScan();
	const pretty = formatPretty(result, { color: false });

	assert.match(pretty, /sheplu\/Octolens/);
	assert.match(pretty, /Summary/);
}

test('exitCodeFor returns 1 when findings exist', exitCode1Case);

async function exitCode1Case() {
	mockRepoMetadata();
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	mockCatchAll();

	const result = await runFullScan();
	const code = exitCodeFor(result);

	assert.equal(code, 1);
	assert.ok(result.summary.findingsTotal > 0);
}

test('exitCodeFor returns 0 when no findings at threshold', exitCode0Case);

async function exitCode0Case() {
	mockRepoMetadata();
	mockProtected();
	mockCatchAll();

	const result = await scanRepo({
		repo: { owner: 'sheplu', name: 'Octolens' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'critical',
	});

	assert.equal(result.summary.findingsTotal, 0);
	assert.equal(exitCodeFor(result), 0);
}

test('--fail-on-skip: exitCodeFor returns 1 when rules skipped', failOnSkipCase);

async function failOnSkipCase() {
	mockRepoMetadata();
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	mockCatchAll();

	const result = await scanRepo({
		repo: { owner: 'sheplu', name: 'Octolens' },
		rules: [ ...allRules ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'critical',
	});

	assert.ok(result.summary.rulesSkipped > 0);
	assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
}

test('500 from all endpoints produces errored rules, not a crash', serverErrorCase);

async function serverErrorCase() {
	nock(BASE).persist().get(/.*/)
		.reply(500, { message: 'Internal Server Error' });
	nock(BASE).persist().head(/.*/)
		.reply(500, { message: 'Internal Server Error' });

	const result = await runFullScan();

	assert.ok(result.summary.rulesErrored > 0);
	assert.ok(result.summary.rulesRun > 0);
}
