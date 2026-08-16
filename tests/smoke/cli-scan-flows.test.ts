import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, readFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nock from 'nock';
import { main } from '../../src/cli/main.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';

const BASE = 'https://api.github.com';
const REPO_PATH = '/repos/sheplu/Octolens';

type JsonReport = {
	schemaVersion: number;
	target: Record<string, string>;
	runs: { ruleId: string; status: string; }[];
	findings: {
		ruleId: string; severity: string; title: string;
	}[];
	summary: Record<string, unknown>;
};

const stdoutChunks: string[] = [];
const stderrChunks: string[] = [];

const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);

const saved: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

beforeEach(setupCase);

function setupCase() {
	nock.disableNetConnect();
	saved.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
	saved.OCTOLENS_TOKEN = process.env.OCTOLENS_TOKEN;
	saved.PATH = process.env.PATH;
	delete process.env.GITHUB_TOKEN;
	delete process.env.OCTOLENS_TOKEN;
}

afterEach(teardownCase);

function teardownCase() {
	process.stdout.write = originalStdout;
	process.stderr.write = originalStderr;
	nock.cleanAll();
	nock.enableNetConnect();

	for (const name of [
		'GITHUB_TOKEN',
		'OCTOLENS_TOKEN',
		'PATH',
	]) {
		if (saved[name] === undefined) {
			delete process.env[name];
		} else {
			process.env[name] = saved[name];
		}
	}

	for (const dir of tempDirs.splice(0)) {
		rmSync(dir, { recursive: true, force: true });
	}
}

/**
 * Redirect stdout/stderr into the chunk arrays. Called inside each test body
 * (not in beforeEach) so the test reporter's own writes stay on the real
 * streams between tests.
 */
function captureOutput() {
	stdoutChunks.length = 0;
	stderrChunks.length = 0;
	process.stdout.write = function spyOut(chunk: string | Uint8Array): boolean {
		if (typeof chunk !== 'string') {
			return originalStdout(chunk);
		}
		stdoutChunks.push(chunk);

		return true;
	};
	process.stderr.write = function spyErr(chunk: string | Uint8Array): boolean {
		if (typeof chunk !== 'string') {
			return originalStderr(chunk);
		}
		stderrChunks.push(chunk);

		return true;
	};
}

function stdoutText(): string {
	return stdoutChunks.join('');
}

function stderrText(): string {
	return stderrChunks.join('');
}

function mockCatchAll(): void {
	nock(BASE).persist().get(new RegExp(`${REPO_PATH}/`))
		.reply(200, []);
	nock(BASE).persist().head(new RegExp(`${REPO_PATH}/`))
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

/** A repository passing every rule at the default `high` threshold. */
function mockCleanRepo(): void {
	nock(BASE).get(REPO_PATH).reply(200, makeRepoResponse({
		secretScanning: 'enabled',
		secretScanningPushProtection: 'enabled',
	}));
	nock(BASE)
		.get(`${REPO_PATH}/branches/main/protection`)
		.reply(200, {
			url: `${BASE}${REPO_PATH}/branches/main/protection`,
			required_pull_request_reviews: { required_approving_review_count: 1 },
			enforce_admins: { enabled: true },
			required_linear_history: { enabled: false },
			allow_force_pushes: { enabled: false },
			required_conversation_resolution: { enabled: false },
			required_signatures: { enabled: false },
		});
	nock(BASE)
		.get(`${REPO_PATH}/automated-security-fixes`)
		.reply(200, { enabled: true, paused: false });
	nock(BASE)
		.get(`${REPO_PATH}/code-scanning/analyses`)
		.query(true)
		.reply(200, [ { id: 1, tool: { name: 'CodeQL' } } ]);
	nock(BASE)
		.get(`${REPO_PATH}/actions/permissions/workflow`)
		.reply(200, {
			default_workflow_permissions: 'read',
			can_approve_pull_request_reviews: false,
		});
	mockCatchAll();
}

/** A repository with no branch protection: critical finding, exit 1. */
function mockFlaggedRepo(): void {
	nock(BASE).get(REPO_PATH).reply(200, makeRepoResponse());
	nock(BASE)
		.get(`${REPO_PATH}/branches/main/protection`)
		.reply(404, { message: 'Branch not protected' });
	mockCatchAll();
}

function scanArgs(...extra: string[]): string[] {
	return [
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		...extra,
	];
}

test('a clean repository scans to exit 0 with a pretty summary', cleanScan);

async function cleanScan() {
	captureOutput();
	mockCleanRepo();

	const code = await main(scanArgs());

	assert.equal(code, 0);
	assert.match(stdoutText(), /Octolens scan — sheplu\/Octolens/);
	assert.doesNotMatch(stdoutText(), /undefined/);
}

test('a flagged repository exits 1 with a valid JSON report', flaggedJsonScan);

async function flaggedJsonScan() {
	captureOutput();
	mockFlaggedRepo();

	const code = await main(scanArgs('--format', 'json'));

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as JsonReport;

	assert.equal(report.schemaVersion, 1);
	assert.deepEqual(report.target, {
		type: 'repo', owner: 'sheplu', name: 'Octolens',
	});
	assert.ok(report.runs.length >= 40);
	assert.ok(report.findings.some(isBranchProtectionFinding));
	assert.equal(report.summary.findingsTotal, report.findings.length);
}

function isBranchProtectionFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId === 'repo-config/branch-protection-required';
}

test('markdown output renders a report document', markdownScan);

async function markdownScan() {
	captureOutput();
	mockFlaggedRepo();

	const code = await main(scanArgs('--format', 'md'));

	assert.equal(code, 1);
	assert.match(stdoutText(), /^# Octolens/);
	assert.match(stdoutText(), /\|/);
	assert.doesNotMatch(stdoutText(), /undefined/);
}

test('multiple formats are emitted in order on stdout', multiFormatScan);

async function multiFormatScan() {
	captureOutput();
	mockFlaggedRepo();

	const code = await main(scanArgs(
		'--format',
		'json',
		'--format',
		'md',
	));

	assert.equal(code, 1);

	const output = stdoutText();
	const jsonEnd = output.lastIndexOf('}') + 1;

	assert.ok(JSON.parse(output.slice(0, jsonEnd)));
	assert.match(output.slice(jsonEnd), /# Octolens/);
}

test('--out writes the last format to disk', outFileScan);

async function outFileScan() {
	captureOutput();
	mockFlaggedRepo();
	const dir = mkdtempSync(join(tmpdir(), 'octolens-smoke-'));

	tempDirs.push(dir);
	const out = join(dir, 'report.md');

	const code = await main(scanArgs(
		'--format',
		'json',
		'--format',
		'md',
		'--out',
		out,
	));

	assert.equal(code, 1);

	// JSON stays on stdout; the markdown report lands in the file.
	assert.ok(JSON.parse(stdoutText()));
	assert.match(readFileSync(out, 'utf8'), /^# Octolens/);
}

test('--severity critical keeps only critical findings', severityFilterScan);

async function severityFilterScan() {
	captureOutput();
	mockFlaggedRepo();

	const code = await main(scanArgs(
		'--format',
		'json',
		'--severity',
		'critical',
	));

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as JsonReport;

	assert.ok(report.findings.length > 0);
	assert.ok(report.findings.every(isCritical));
}

function isCritical(finding: { severity: string; }): boolean {
	return finding.severity === 'critical';
}

test('--verbose traces progress on stderr', verboseScan);

async function verboseScan() {
	captureOutput();
	mockCleanRepo();

	const code = await main(scanArgs('--verbose'));

	assert.equal(code, 0);
	assert.match(stderrText(), /\[debug\] auth source: flag/);
}

test('a missing token fails the scan with exit 2', authErrorScan);

async function authErrorScan() {
	captureOutput();
	process.env.PATH = '';

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
	]);

	assert.equal(code, 2);
	assert.match(stderrText(), /No GitHub token found/);
}

test('an org posture scan honours --fail-on-skip', orgPostureScan);

async function orgPostureScan() {
	captureOutput();
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });

	const lenient = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--token',
		't',
		'--format',
		'json',
	]);

	assert.equal(lenient, 0);

	const report = JSON.parse(stdoutText()) as JsonReport;

	assert.equal(report.target.type, 'org');

	const strict = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--token',
		't',
		'--fail-on-skip',
	]);

	assert.equal(strict, 1);
}

test('a fleet scan reports each repository', fleetScan);

async function fleetScan() {
	captureOutput();
	nock(BASE)
		.get('/orgs/silverwalls-labs/repos')
		.query({ per_page: '100', type: 'all' })
		.reply(200, [
			{
				'name': 'app',
				'owner': { login: 'silverwalls-labs' },
				'archived': false,
				'fork': false,
				'private': false,
				'visibility': 'public',
			},
		]);
	nock(BASE).get('/repos/silverwalls-labs/app').reply(200, makeRepoResponse());
	nock(BASE).persist().get(/\/repos\/silverwalls-labs\/app\//)
		.reply(200, []);
	nock(BASE).persist().head(/\/repos\/silverwalls-labs\/app\//)
		.reply(204);
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });

	const code = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--all-repos',
		'--token',
		't',
		'--format',
		'json',
	]);

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as JsonReport & { repos: unknown[]; };

	assert.equal(report.target.type, 'org-fleet');
	assert.equal(report.repos.length, 1);
}
