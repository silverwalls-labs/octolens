import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import nock from 'nock';
import { main } from '../../src/cli/main.ts';
import { makeRepoResponse } from '../helpers/fixtures.ts';
import { captureOutput, restoreOutput } from '../helpers/context.ts';

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

const saved: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

describe('cli scan flows', () => {
	beforeEach(() => {
		nock.disableNetConnect();
		saved.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
		saved.OCTOLENS_TOKEN = process.env.OCTOLENS_TOKEN;
		saved.PATH = process.env.PATH;
		saved.XDG_CONFIG_HOME = process.env.XDG_CONFIG_HOME;
		delete process.env.GITHUB_TOKEN;
		delete process.env.OCTOLENS_TOKEN;

		// Keep a developer's real ~/.config/octolens/config.json out of the runs.
		const configHome = mkdtempSync(join(tmpdir(), 'octolens-xdg-'));

		tempDirs.push(configHome);
		process.env.XDG_CONFIG_HOME = configHome;
	});

	afterEach(() => {
		restoreOutput();
		nock.cleanAll();
		nock.enableNetConnect();

		for (const name of [
			'GITHUB_TOKEN',
			'OCTOLENS_TOKEN',
			'PATH',
			'XDG_CONFIG_HOME',
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
	});

	test(
		'a clean repository scans to exit 0 with a pretty summary',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockCleanRepo();

			const code = await main(scanArgs());

			assert.equal(code, 0);
			assert.match(
				stdoutChunks.join(''),
				/Octolens scan — sheplu\/Octolens/,
			);
			assert.doesNotMatch(stdoutChunks.join(''), /undefined/);
		},
	);

	test(
		'a flagged repository exits 1 with a valid JSON report',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockFlaggedRepo();

			const code = await main(scanArgs('--format', 'json'));

			assert.equal(code, 1);

			const report = JSON.parse(stdoutChunks.join('')) as JsonReport;

			assert.equal(report.schemaVersion, 1);
			assert.deepEqual(report.target, {
				type: 'repo', owner: 'sheplu', name: 'Octolens',
			});
			assert.ok(report.runs.length >= 40);
			assert.ok(report.findings.some(isBranchProtectionFinding));
			assert.equal(
				report.summary.findingsTotal,
				report.findings.length,
			);
		},
	);

	test('markdown output renders a report document', async () => {
		const { stdoutChunks } = captureOutput();

		mockFlaggedRepo();

		const code = await main(scanArgs('--format', 'md'));

		assert.equal(code, 1);
		assert.match(stdoutChunks.join(''), /^# Octolens/);
		assert.match(stdoutChunks.join(''), /\|/);
		assert.doesNotMatch(stdoutChunks.join(''), /undefined/);
	});

	test(
		'multiple formats are emitted in order on stdout',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockFlaggedRepo();

			const code = await main(scanArgs(
				'--format',
				'json',
				'--format',
				'md',
			));

			assert.equal(code, 1);

			const output = stdoutChunks.join('');
			const jsonEnd = output.lastIndexOf('}') + 1;

			assert.ok(JSON.parse(output.slice(0, jsonEnd)));
			assert.match(output.slice(jsonEnd), /# Octolens/);
		},
	);

	test('--out writes the last format to disk', async () => {
		const { stdoutChunks } = captureOutput();

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

		assert.ok(JSON.parse(stdoutChunks.join('')));
		assert.match(readFileSync(out, 'utf8'), /^# Octolens/);
	});

	test(
		'--severity critical keeps only critical findings',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockFlaggedRepo();

			const code = await main(scanArgs(
				'--format',
				'json',
				'--severity',
				'critical',
			));

			assert.equal(code, 1);

			const report = JSON.parse(stdoutChunks.join('')) as JsonReport;

			assert.ok(report.findings.length > 0);
			assert.ok(report.findings.every(isCritical));
		},
	);

	test('--verbose traces progress on stderr', async () => {
		const { stderrChunks } = captureOutput();

		mockCleanRepo();

		const code = await main(scanArgs('--verbose'));

		assert.equal(code, 0);
		assert.match(
			stderrChunks.join(''),
			/\[debug\] auth source: flag/,
		);
	});

	test('a missing token fails the scan with exit 2', async () => {
		const { stderrChunks } = captureOutput();

		process.env.PATH = '';

		const code = await main([
			'scan',
			'--repo',
			'sheplu/Octolens',
		]);

		assert.equal(code, 2);
		assert.match(
			stderrChunks.join(''),
			/No GitHub token found/,
		);
	});

	test(
		'an org posture scan honours --fail-on-skip',
		async () => {
			const { stdoutChunks } = captureOutput();

			nock(BASE).persist()
				.get(/\/orgs\/silverwalls-labs/)
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

			const report = JSON.parse(stdoutChunks.join('')) as JsonReport;

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
		},
	);

	test('a fleet scan reports each repository', async () => {
		const { stdoutChunks } = captureOutput();

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
		nock(BASE).get('/repos/silverwalls-labs/app')
			.reply(200, makeRepoResponse());
		nock(BASE).persist()
			.get(/\/repos\/silverwalls-labs\/app\//)
			.reply(200, []);
		nock(BASE).persist()
			.head(/\/repos\/silverwalls-labs\/app\//)
			.reply(204);
		nock(BASE).persist()
			.get(/\/orgs\/silverwalls-labs/)
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

		const report = JSON.parse(stdoutChunks.join('')) as JsonReport & { repos: unknown[]; };

		assert.equal(report.target.type, 'org-fleet');
		assert.equal(report.repos.length, 1);
	});

	test(
		'home and project config files merge into the scan',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockFlaggedRepo();

			// Home level (via the XDG dir pinned in beforeEach), as JSON5.
			const homeDir = join(process.env.XDG_CONFIG_HOME as string, 'octolens');

			mkdirSync(homeDir, { recursive: true });
			writeFileSync(join(homeDir, 'config.json5'), [
				'{',
				"  rules: { 'repo-config/topics-present': 'off' },",
				'  org: { concurrency: 2 },',
				'}',
			].join('\n'));

			// Project level as JSONC, in a chdir'ed working directory.
			const cwd = mkdtempSync(join(tmpdir(), 'octolens-smoke-cwd-'));

			tempDirs.push(cwd);
			writeFileSync(join(cwd, 'octolens.config.jsonc'), [
				'{',
				'  // this sandbox is intentionally unprotected',
				'  "rules": { "repo-config/branch-protection-required": "off" },',
				'  "ignore": {',
				'    "repos": [ "acme/sandbox", ], "archived": true, "forks": false,',
				'  },',
				'}',
			].join('\n'));

			const previous = process.cwd();

			process.chdir(cwd);
			let code;

			try {
				code = await main(scanArgs('--format', 'json'));
			} finally {
				process.chdir(previous);
			}

			assert.ok(code === 0 || code === 1);

			const report = JSON.parse(stdoutChunks.join('')) as JsonReport;

			assert.ok(!report.runs.some(isBranchProtectionFinding));
			assert.ok(!report.runs.some((run) => run.ruleId === 'repo-config/topics-present'));
		},
	);

	test(
		'a package.json octolens key configures the scan',
		async () => {
			const { stdoutChunks } = captureOutput();

			mockFlaggedRepo();

			const cwd = mkdtempSync(join(tmpdir(), 'octolens-smoke-cwd-'));

			tempDirs.push(cwd);
			writeFileSync(join(cwd, 'package.json'), JSON.stringify({
				name: 'app',
				octolens: { rules: { 'repo-config/branch-protection-required': 'off' } },
			}));

			const previous = process.cwd();

			process.chdir(cwd);
			let code;

			try {
				code = await main(scanArgs('--format', 'json'));
			} finally {
				process.chdir(previous);
			}

			assert.ok(code === 0 || code === 1);

			const report = JSON.parse(stdoutChunks.join('')) as JsonReport;

			assert.ok(!report.runs.some(isBranchProtectionFinding));
		},
	);

	test(
		'an invalid config file fails the scan with exit 2',
		async () => {
			const { stderrChunks } = captureOutput();

			const cwd = mkdtempSync(join(tmpdir(), 'octolens-smoke-cwd-'));

			tempDirs.push(cwd);
			writeFileSync(
				join(cwd, 'octolens.config.jsonc'),
				'{\n  "rules": nope\n}',
			);

			const previous = process.cwd();

			process.chdir(cwd);
			let code;

			try {
				code = await main(scanArgs());
			} finally {
				process.chdir(previous);
			}

			assert.equal(code, 2);
			assert.match(
				stderrChunks.join(''),
				/octolens\.config\.jsonc: invalid JSONC \(.+ at \d+:\d+\)/,
			);
		},
	);
});

function mockCatchAll(): void {
	nock(BASE).persist().get(new RegExp(`${REPO_PATH}/`))
		.reply(200, []);
	nock(BASE).persist().head(new RegExp(`${REPO_PATH}/`))
		.reply(204);
	nock(BASE).persist().get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

function mockCleanRepo(): void {
	nock(BASE).get(REPO_PATH).reply(200, makeRepoResponse({
		secretScanning: 'enabled',
		secretScanningPushProtection: 'enabled',
	}));
	nock(BASE)
		.get(`${REPO_PATH}/branches/main/protection`)
		.reply(200, {
			url: `${BASE}${REPO_PATH}/branches/main/protection`,
			required_pull_request_reviews: {
				required_approving_review_count: 1,
			},
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

function isBranchProtectionFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId ===
		'repo-config/branch-protection-required';
}

function isCritical(finding: { severity: string; }): boolean {
	return finding.severity === 'critical';
}
