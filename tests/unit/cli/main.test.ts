import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, readFileSync, rmSync, writeFileSync,
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

describe('cli main', () => {
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
		process.stdout.write = originalStdout;
		process.stderr.write = originalStderr;
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
		'a repo scan renders JSON and exits 1 on findings',
		async () => {
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
		},
	);

	test(
		'a repo scan renders markdown and pretty output',
		async () => {
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
		},
	);

	test(
		'a repo scan renders SARIF and exits 1 on findings',
		async () => {
			captureOutput();
			mockRepoScan();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'sarif',
			]);

			assert.equal(code, 1);

			const doc = JSON.parse(stdoutText()) as {
				version: string;
				runs: {
					tool: { driver: { name: string; }; };
					results: { ruleId: string; }[];
				}[];
			};

			assert.equal(doc.version, '2.1.0');
			assert.equal(doc.runs[0].tool.driver.name, 'octolens');
			assert.ok(doc.runs[0].results.some(isBranchProtectionFinding));
		},
	);

	test(
		'--out writes the last format to a file, earlier ones to stdout',
		async () => {
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

			const report = JSON.parse(stdoutText()) as {
				schemaVersion?: number;
			};

			assert.equal(typeof report, 'object');
			assert.match(
				readFileSync(out, 'utf8'),
				/# Octolens/,
			);
		},
	);

	test('--verbose logs the auth source to stderr', async () => {
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
		assert.match(
			stderrText(),
			/\[debug\] auth source: flag/,
		);
	});

	test(
		'a missing token exits 2 with an error message',
		async () => {
			captureOutput();
			process.env.PATH = '';

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /No GitHub token found/);
		},
	);

	test('no arguments prints help and exits 0', async () => {
		captureOutput();

		const code = await main([]);

		assert.equal(code, 0);
		assert.match(stdoutText(), /Usage/i);
	});

	test('--version prints the version and exits 0', async () => {
		captureOutput();

		const code = await main([ '--version' ]);

		assert.equal(code, 0);
		assert.match(stdoutText(), /^\d+\.\d+\.\d+/);
	});

	test(
		'a usage error prints help on stderr and exits 2',
		async () => {
			captureOutput();

			const code = await main([ 'bogus' ]);

			assert.equal(code, 2);
			assert.match(stderrText(), /Unknown command: bogus/);
			assert.match(stderrText(), /Usage/i);
		},
	);

	test('non-usage parse failures are rethrown', async () => {
		await assert.rejects(
			main(null as unknown as string[]),
			TypeError,
		);
	});

	test('an org scan without API access exits 0', async () => {
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

		const result = JSON.parse(stdoutText()) as {
			target: { type: string; };
		};

		assert.equal(result.target.type, 'org');
	});

	test(
		'--fail-on-skip turns an incomplete org scan into exit 1',
		async () => {
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
		},
	);

	test('a fleet scan renders a JSON report', async () => {
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
	});

	test(
		'a fleet scan renders markdown and pretty reports',
		async () => {
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
		},
	);

	test('a fleet scan renders a SARIF report', async () => {
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
			'sarif',
		]);

		assert.equal(code, 0);

		const doc = JSON.parse(stdoutText()) as {
			version: string;
			runs: { automationDetails: { id: string; }; }[];
		};

		assert.equal(doc.version, '2.1.0');
		assert.equal(
			doc.runs[0].automationDetails.id,
			'octolens/org-fleet/silverwalls-labs/',
		);
	});

	test(
		'--allow-public suppresses the visibility finding',
		async () => {
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

			const report = JSON.parse(stdoutText()) as {
				findings: { ruleId: string; }[];
			};

			assert.ok(!report.findings.some(isVisibilityFinding));
		},
	);

	test(
		'a public repo is flagged without --allow-public',
		async () => {
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

			const report = JSON.parse(stdoutText()) as {
				findings: { ruleId: string; }[];
			};

			assert.ok(report.findings.some(isVisibilityFinding));
		},
	);

	test(
		'a project config file disables a rule',
		async () => {
			captureOutput();
			mockRepoScan();
			const cwd = makeConfigDir({
				rules: { 'repo-config/branch-protection-required': 'off' },
			});

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--verbose',
			]));

			assert.ok(code === 0 || code === 1);
			assert.match(stderrText(), /\[debug\] config loaded from .*octolens\.config\.json/);

			const report = JSON.parse(stdoutText()) as {
				findings: { ruleId: string; }[];
				runs: { ruleId: string; }[];
			};

			assert.ok(!report.findings.some(isBranchProtectionFinding));
			assert.ok(!report.runs.some(isBranchProtectionFinding));
		},
	);

	test(
		'a project config.jsonc with comments disables a rule',
		async () => {
			captureOutput();
			mockRepoScan();
			const cwd = mkdtempSync(join(tmpdir(), 'octolens-cwd-'));

			tempDirs.push(cwd);
			writeFileSync(join(cwd, 'octolens.config.jsonc'), [
				'{',
				'  // deliberately unprotected sandbox repo',
				'  "rules": { "repo-config/branch-protection-required": "off", },',
				'}',
			].join('\n'));

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
			]));

			assert.ok(code === 0 || code === 1);

			const report = JSON.parse(stdoutText()) as {
				runs: { ruleId: string; }[];
			};

			assert.ok(!report.runs.some(isBranchProtectionFinding));
		},
	);

	test(
		'an unknown rule id in config exits 2 without scanning',
		async () => {
			captureOutput();
			mockRepoScan();
			const cwd = makeConfigDir({
				rules: { 'security/dependabot-alert-enabled': 'off' },
			});

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
			]));

			assert.equal(code, 2);

			assert.match(
				stderrText(),
				/unknown rule ID\(s\) in config "rules" \(.*octolens\.config\.json\): security\/dependabot-alert-enabled\n/,
			);

			assert.equal(stdoutText(), '', 'no scan output on a config error');
		},
	);

	test(
		'--only-rules with an unmatched pattern exits 2',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--only-rules',
				'nonexistent/*',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /glob pattern\(s\) matched no known rule ID/);
			assert.match(stderrText(), /nonexistent\/\*/);
		},
	);

	test(
		'--skip-rules with an unmatched pattern exits 2',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--skip-rules',
				'bogus/*',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /glob pattern\(s\) matched no known rule ID/);
		},
	);

	test(
		'--only-rules combined with --skip-rules that excludes all rules exits 2',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--only-rules',
				'security/*',
				'--skip-rules',
				'security/*',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /no rules remain/);
		},
	);

	test(
		'--only-rules narrows a repo scan to matching rules',
		async () => {
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
				'--only-rules',
				'repo-config/branch-*',
			]);

			assert.ok(code === 0 || code === 1);

			const report = JSON.parse(stdoutText()) as {
				runs: { ruleId: string; }[];
			};

			assert.ok(report.runs.length > 0);
			assert.ok(report.runs.every((r) => r.ruleId.startsWith('repo-config/branch-')));
		},
	);

	test(
		'--skip-rules excludes matching rules from a repo scan',
		async () => {
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
				'--skip-rules',
				'repo-config/*',
			]);

			assert.ok(code === 0 || code === 1);

			const report = JSON.parse(stdoutText()) as {
				runs: { ruleId: string; }[];
			};

			assert.ok(!report.runs.some((r) => r.ruleId.startsWith('repo-config/')));
		},
	);

	test(
		'--only-rules scoped to org rules passes for --org scan',
		async () => {
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
				'--only-rules',
				'org/two-*',
			]);

			assert.equal(code, 0);

			const report = JSON.parse(stdoutText()) as {
				runs: { ruleId: string; }[];
			};

			assert.ok(report.runs.every((r) => r.ruleId.startsWith('org/two-')));
		},
	);

	test(
		'a negated --only-rules pattern exits 2 with a usage error',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--only-rules',
				'!security/*',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /Negated patterns are not supported/);
			assert.match(stderrText(), /Usage/i);
		},
	);

	test(
		'an empty --skip-rules value exits 2 with a usage error',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--skip-rules',
				'',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /Expected a glob pattern/);
		},
	);

	test(
		'a fleet scan warns when filtering leaves no repo rules',
		async () => {
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
				'--only-rules',
				'org/*',
			]);

			assert.equal(code, 0);
			assert.match(stderrText(), /\[warn\] glob filtering left no repo rules/);
		},
	);

	test(
		'a fleet scan warns when filtering leaves no org rules',
		async () => {
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
				'--only-rules',
				'security/*',
			]);

			assert.equal(code, 0);
			assert.match(stderrText(), /\[warn\] glob filtering left no org rules/);
		},
	);

	test(
		'ambiguous config sources exit 2, listing every source',
		async () => {
			captureOutput();
			const cwd = makeConfigDir({});

			writeFileSync(join(cwd, 'octolens.config.json5'), '{}');

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
			]));

			assert.equal(code, 2);
			assert.match(stderrText(), /multiple config sources/);
			assert.match(stderrText(), /octolens\.config\.json\b/);
			assert.match(stderrText(), /octolens\.config\.json5/);
		},
	);

	test(
		'an invalid config file exits 2 with a message naming the file',
		async () => {
			captureOutput();
			const cwd = makeConfigDir({ output: { format: 'md' } });

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
			]));

			assert.equal(code, 2);
			assert.match(stderrText(), /octolens\.config\.json.*unknown key "output"/);
		},
	);

	test(
		'--include-archived overrides a config ignore.archived',
		async () => {
			captureOutput();
			mockArchivedRepoScan();
			const cwd = makeConfigDir({ ignore: { archived: true } });

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--include-archived',
			]));

			assert.equal(code, 1);

			const report = JSON.parse(stdoutText()) as {
				summary: { rulesRun: number; };
			};

			assert.ok(report.summary.rulesRun > 0);
		},
	);

	test(
		'a config ignore.archived skips an archived repo without the flag',
		async () => {
			captureOutput();
			mockArchivedRepoScan();
			const cwd = makeConfigDir({ ignore: { archived: true } });

			const code = await inDir(cwd, () => main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
			]));

			assert.equal(code, 0);

			const report = JSON.parse(stdoutText()) as {
				summary: { rulesRun: number; rulesSkipped: number; };
			};

			assert.equal(report.summary.rulesRun, 0);
			assert.ok(report.summary.rulesSkipped > 0);
		},
	);
});

/** Create a temp working directory holding an `octolens.config.json`. */
function makeConfigDir(config: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-cwd-'));

	tempDirs.push(dir);
	writeFileSync(join(dir, 'octolens.config.json'), JSON.stringify(config));

	return dir;
}

/** Run a callback with the process chdir'ed into `dir`, restoring after. */
async function inDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
	const previous = process.cwd();

	process.chdir(dir);
	try {
		return await fn();
	} finally {
		process.chdir(previous);
	}
}

function mockRepoScan(): void {
	nock(BASE)
		.get('/repos/sheplu/Octolens')
		.reply(200, makeRepoResponse());
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	nock(BASE).persist()
		.get(/\/repos\/sheplu\/Octolens\//)
		.reply(200, []);
	nock(BASE).persist()
		.head(/\/repos\/sheplu\/Octolens\//)
		.reply(204);
	nock(BASE).persist()
		.get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

function mockArchivedRepoScan(): void {
	nock(BASE).persist()
		.get('/repos/sheplu/Octolens')
		.reply(200, { ...makeRepoResponse(), archived: true });
	nock(BASE)
		.get('/repos/sheplu/Octolens/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	nock(BASE).persist()
		.get(/\/repos\/sheplu\/Octolens\//)
		.reply(200, []);
	nock(BASE).persist()
		.head(/\/repos\/sheplu\/Octolens\//)
		.reply(204);
	nock(BASE).persist()
		.get(/\/orgs\//)
		.reply(404, { message: 'Not Found' });
}

function mockOrgScan(): void {
	nock(BASE).persist()
		.get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });
}

function mockEmptyFleet(): void {
	nock(BASE)
		.get('/orgs/silverwalls-labs/repos')
		.query(true)
		.reply(200, []);
	nock(BASE).persist()
		.get(/\/orgs\/silverwalls-labs/)
		.reply(404, { message: 'Not Found' });
}

function isBranchProtectionFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId ===
		'repo-config/branch-protection-required';
}

function isVisibilityFinding(finding: { ruleId: string; }): boolean {
	return finding.ruleId ===
		'access/visibility-private-default';
}
