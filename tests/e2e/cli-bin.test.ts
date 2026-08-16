import { test } from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';
import { promisify } from 'node:util';

const execFileAsync = promisify(execFile);

const token = process.env['OCTOLENS_E2E_TOKEN'] ??
	process.env['GITHUB_TOKEN'] ??
	process.env['OCTOLENS_TOKEN'];

const here = dirname(fileURLToPath(import.meta.url));
const binPath = resolve(here, '..', '..', 'bin', 'octolens.js');
const distBuilt = existsSync(resolve(here, '..', '..', 'dist', 'cli', 'main.js'));

const NO_TOKEN_SKIP = 'no OCTOLENS_E2E_TOKEN (or GITHUB_TOKEN/OCTOLENS_TOKEN)';
const NO_DIST_SKIP = 'dist/ is not built (run npm run build first)';

type BinRun = {
	code: number;
	stdout: string;
	stderr: string;
};

async function runBin(args: string[]): Promise<BinRun> {
	try {
		const { stdout, stderr } = await execFileAsync('node', [ binPath, ...args ], {
			maxBuffer: 10 * 1024 * 1024,
		});

		return {
			code: 0, stdout, stderr,
		};
	} catch (err) {
		const failed = err as BinRun & { code?: number; };

		return {
			code: failed.code ?? 1,
			stdout: failed.stdout,
			stderr: failed.stderr,
		};
	}
}

if (!distBuilt) {
	test('e2e bin tests skipped', { skip: NO_DIST_SKIP }, noopTest);
}

function noopTest() {
	/* placeholder */
}

if (distBuilt) {
	test('the bin prints its version and exits 0', { timeout: 30_000 }, versionCase);
	test('the bin rejects bad usage with exit 2', { timeout: 30_000 }, usageCase);
}

async function versionCase() {
	const run = await runBin([ '--version' ]);

	assert.equal(run.code, 0);
	assert.match(run.stdout, /^\d+\.\d+\.\d+/);
}

async function usageCase() {
	const run = await runBin([ 'scan' ]);

	assert.equal(run.code, 2);
	assert.match(run.stderr, /--repo <owner\/name> or --org/);
}

if (distBuilt && !token) {
	test('e2e bin scan skipped', { skip: NO_TOKEN_SKIP }, noopTest);
}

if (distBuilt && token) {
	test('the bin scans a real repository to JSON', { timeout: 120_000 }, scanCase);
}

async function scanCase() {
	const run = await runBin([
		'scan',
		'--repo',
		'silverwalls-labs/review',
		'--format',
		'json',
		'--token',
		token as string,
	]);

	// The review repo is intentionally misconfigured: findings mean exit 1.
	assert.equal(run.code, 1);

	const report = JSON.parse(run.stdout) as {
		schemaVersion: number;
		target: Record<string, string>;
		findings: unknown[];
	};

	assert.equal(report.schemaVersion, 1);
	assert.deepEqual(report.target, {
		type: 'repo', owner: 'silverwalls-labs', name: 'review',
	});
	assert.ok(report.findings.length > 0);
}
