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
import { main } from '../../../src/cli/main.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';

const BASE = 'https://api.github.com';

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

/**
 * Redirect stdout/stderr into the chunk arrays. Called inside each test body
 * (not in beforeEach) so the test reporter's own writes stay on the real
 * streams between tests.
 */
function captureOutput() {
	stdoutChunks.length = 0;
	stderrChunks.length = 0;
	process.stdout.write = function spyOut(chunk: string | Uint8Array): boolean {
		// The test runner streams its own Buffer chunks; only the CLI writes strings.
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

function stdoutText(): string {
	return stdoutChunks.join('');
}

function stderrText(): string {
	return stderrChunks.join('');
}

function mockRepoScan(): void {
	nock(BASE).get('/repos/sheplu/Octolens').reply(200, makeRepoResponse());
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	nock(BASE).persist().get(/\/repos\/sheplu\/Octolens\//)
		.reply(200, []);
	nock(BASE).persist().head(/\/repos\/sheplu\/Octolens\//)
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

function mockOrgScan(): void {
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });
}

function mockEmptyFleet(): void {
	nock(BASE)
		.get('/orgs/silverwalls-labs/repos')
		.query(true)
		.reply(200, []);
	nock(BASE).persist().get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });
}

test('a repo scan renders JSON and exits 1 on findings', repoScanJson);

async function repoScanJson() {
	captureOutput();
	mockRepoScan();

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'json',
	]);

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as {
		target: {
			type: string; owner: string; name: string;
		};
		findings: { ruleId: string; }[];
	};

	assert.deepEqual(report.target, {
		type: 'repo', owner: 'sheplu', name: 'Octolens',
	});
	assert.ok(report.findings.some(isBranchProtectionFinding));
}

function isBranchProtectionFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId === 'repo-config/branch-protection-required';
}

test('a repo scan renders markdown and pretty output', repoScanMdPretty);

async function repoScanMdPretty() {
	captureOutput();
	mockRepoScan();

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'md',
		'--format',
		'pretty',
	]);

	assert.equal(code, 1);
	assert.match(stdoutText(), /# Octolens/);
	assert.match(stdoutText(), /sheplu\/Octolens/);
	assert.doesNotMatch(stdoutText(), /undefined/);
}

test('--out writes the last format to a file, earlier ones to stdout', outFile);

async function outFile() {
	captureOutput();
	mockRepoScan();
	const dir = mkdtempSync(join(tmpdir(), 'octolens-out-'));

	tempDirs.push(dir);
	const out = join(dir, 'report.md');

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'json',
		'--format',
		'md',
		'--out',
		out,
	]);

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as { schemaVersion?: number; };

	assert.equal(typeof report, 'object');
	assert.match(readFileSync(out, 'utf8'), /# Octolens/);
}

test('--verbose logs the auth source to stderr', verboseLogging);

async function verboseLogging() {
	captureOutput();
	mockRepoScan();

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'json',
		'--verbose',
	]);

	assert.equal(code, 1);
	assert.match(stderrText(), /\[debug\] auth source: flag/);
}

test('a missing token exits 2 with an error message', missingToken);

async function missingToken() {
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

test('no arguments prints help and exits 0', helpPath);

async function helpPath() {
	captureOutput();

	const code = await main([]);

	assert.equal(code, 0);
	assert.match(stdoutText(), /Usage/i);
}

test('--version prints the version and exits 0', versionPath);

async function versionPath() {
	captureOutput();

	const code = await main([ '--version' ]);

	assert.equal(code, 0);
	assert.match(stdoutText(), /^\d+\.\d+\.\d+/);
}

test('a usage error prints help on stderr and exits 2', usageErrorPath);

async function usageErrorPath() {
	captureOutput();

	const code = await main([ 'bogus' ]);

	assert.equal(code, 2);
	assert.match(stderrText(), /Unknown command: bogus/);
	assert.match(stderrText(), /Usage/i);
}

test('non-usage parse failures are rethrown', parseRethrow);

async function parseRethrow() {
	await assert.rejects(
		main(null as unknown as string[]),
		TypeError,
	);
}

test('an org scan without API access exits 0', orgScanClean);

async function orgScanClean() {
	captureOutput();
	mockOrgScan();

	const code = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--token',
		't',
		'--format',
		'json',
	]);

	assert.equal(code, 0);

	const result = JSON.parse(stdoutText()) as { target: { type: string; }; };

	assert.equal(result.target.type, 'org');
}

test('--fail-on-skip turns an incomplete org scan into exit 1', orgScanFailOnSkip);

async function orgScanFailOnSkip() {
	captureOutput();
	mockOrgScan();

	const code = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--token',
		't',
		'--format',
		'json',
		'--fail-on-skip',
	]);

	assert.equal(code, 1);
}

test('a fleet scan renders a JSON report', fleetScanJson);

async function fleetScanJson() {
	captureOutput();
	mockEmptyFleet();

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

	assert.equal(code, 0);

	const report = JSON.parse(stdoutText()) as {
		target: { type: string; };
		repos: unknown[];
	};

	assert.equal(report.target.type, 'org-fleet');
	assert.deepEqual(report.repos, []);
}

test('a fleet scan renders markdown and pretty reports', fleetScanMdPretty);

async function fleetScanMdPretty() {
	captureOutput();
	mockEmptyFleet();

	const code = await main([
		'scan',
		'--org',
		'silverwalls-labs',
		'--all-repos',
		'--token',
		't',
		'--format',
		'md',
		'--format',
		'pretty',
	]);

	assert.equal(code, 0);
	assert.match(stdoutText(), /# Octolens/);
	assert.match(stdoutText(), /silverwalls-labs/);
	assert.doesNotMatch(stdoutText(), /undefined/);
}

test('--allow-public suppresses the visibility finding', allowPublicSuppression);

async function allowPublicSuppression() {
	captureOutput();
	mockRepoScan();

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'json',
		'--severity',
		'info',
		'--allow-public',
		'sheplu/Octolens',
	]);

	assert.ok(code === 0 || code === 1);

	const report = JSON.parse(stdoutText()) as { findings: { ruleId: string; }[]; };

	assert.ok(!report.findings.some(isVisibilityFinding));
}

test('a public repo is flagged without --allow-public', visibilityFlagged);

async function visibilityFlagged() {
	captureOutput();
	mockRepoScan();

	const code = await main([
		'scan',
		'--repo',
		'sheplu/Octolens',
		'--token',
		't',
		'--format',
		'json',
		'--severity',
		'info',
	]);

	assert.equal(code, 1);

	const report = JSON.parse(stdoutText()) as { findings: { ruleId: string; }[]; };

	assert.ok(report.findings.some(isVisibilityFinding));
}

function isVisibilityFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId === 'access/visibility-private-default';
}
