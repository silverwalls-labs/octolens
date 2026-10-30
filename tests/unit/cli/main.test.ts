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
		'--baseline exits 0 when all current findings match the baseline',
		async () => {
			captureOutput();
			mockRepoScan();

			// First run: capture the full JSON report as a baseline.
			const code1 = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
			]);

			assert.equal(code1, 1);
			const baselineData = stdoutText();
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, baselineData);

			// Second run: same scan against the baseline → exit 0.
			nock.cleanAll();
			captureOutput();
			mockRepoScan();

			const code2 = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code2, 0);
			assert.match(stderrText(), /baseline:.*0 new/);

			const report = JSON.parse(stdoutText()) as {
				findings: unknown[];
			};

			assert.equal(report.findings.length, 0);
		},
	);

	test(
		'--baseline exits 1 when new findings appear',
		async () => {
			captureOutput();

			// Create a baseline with no findings.
			const baseline = {
				schemaVersion: 1,
				target: {
					type: 'repo', owner: 'sheplu', name: 'Octolens',
				},
				threshold: 'high',
				runs: [],
				findings: [],
				summary: {
					rulesRun: 0,
					rulesErrored: 0,
					rulesSkipped: 0,
					findingsTotal: 0,
					findingsBySeverity: {
						critical: 0, high: 0, medium: 0, low: 0, info: 0,
					},
				},
			};
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, JSON.stringify(baseline));

			mockRepoScan();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code, 1);
			assert.match(stderrText(), /baseline:.*new/);

			const report = JSON.parse(stdoutText()) as {
				findings: { ruleId: string; }[];
			};

			assert.ok(report.findings.length > 0);
		},
	);

	test(
		'--baseline with a missing file exits 2',
		async () => {
			captureOutput();

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--baseline',
				'/tmp/octolens-does-not-exist.json',
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /Cannot read baseline file/);
		},
	);

	test(
		'--baseline with wrong target type exits 2',
		async () => {
			captureOutput();
			const baseline = {
				schemaVersion: 1,
				target: { type: 'org', org: 'silverwalls-labs' },
				threshold: 'high',
				runs: [],
				findings: [],
				summary: {
					rulesRun: 0,
					rulesErrored: 0,
					rulesSkipped: 0,
					findingsTotal: 0,
					findingsBySeverity: {
						critical: 0, high: 0, medium: 0, low: 0, info: 0,
					},
				},
			};
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, JSON.stringify(baseline));

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code, 2);
			assert.match(stderrText(), /does not match/);
		},
	);

	test(
		'--baseline with --fail-on-skip exits 1 on incomplete coverage even when no new findings',
		async () => {
			captureOutput();
			mockOrgScan();

			// Create an org baseline with the same skipped findings.
			const baseline = {
				schemaVersion: 1,
				target: { type: 'org', org: 'silverwalls-labs' },
				threshold: 'high',
				runs: [],
				findings: [],
				summary: {
					rulesRun: 0,
					rulesErrored: 0,
					rulesSkipped: 0,
					findingsTotal: 0,
					findingsBySeverity: {
						critical: 0, high: 0, medium: 0, low: 0, info: 0,
					},
				},
			};
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, JSON.stringify(baseline));

			const code = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
				'--fail-on-skip',
			]);

			// The org scan skips rules due to 404, so --fail-on-skip triggers exit 1.
			assert.equal(code, 1);
		},
	);

	test(
		'--baseline on a fleet scan with --fail-on-skip exits 1 on incomplete coverage',
		async () => {
			captureOutput();

			// Create a fleet baseline with no findings.
			const baseline = {
				schemaVersion: 1,
				target: { type: 'org-fleet', org: 'silverwalls-labs' },
				threshold: 'high',
				org: {
					schemaVersion: 1,
					target: { type: 'org', org: 'silverwalls-labs' },
					threshold: 'high',
					runs: [],
					findings: [],
					summary: {
						rulesRun: 0,
						rulesErrored: 0,
						rulesSkipped: 0,
						findingsTotal: 0,
						findingsBySeverity: {
							critical: 0, high: 0, medium: 0, low: 0, info: 0,
						},
					},
				},
				repos: [],
				skipped: [],
				failures: [],
				summary: {
					reposDiscovered: 0,
					reposScanned: 0,
					reposSkipped: 0,
					reposFailed: 0,
					listingComplete: true,
					rulesRun: 0,
					rulesErrored: 0,
					rulesSkipped: 0,
					findingsTotal: 0,
					findingsBySeverity: {
						critical: 0, high: 0, medium: 0, low: 0, info: 0,
					},
				},
			};
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, JSON.stringify(baseline));

			mockEmptyFleet();

			// The fleet scan skips all org rules (404), so --fail-on-skip → exit 1.
			const code = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--all-repos',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
				'--fail-on-skip',
			]);

			assert.equal(code, 1);
			assert.match(stderrText(), /baseline:.*0 new/);
		},
	);

	test(
		'--baseline on a fleet scan exits 0 when no new findings',
		async () => {
			captureOutput();
			mockFleetWithOneRepo();

			/*
			 * Org-rule endpoints cannot be mocked without erroring the
			 * rules, and errored rules fail the baseline gate by design.
			 * The full-rule-set round-trip is covered by the repo test.
			 */
			// First run: capture the fleet JSON report.
			const code1 = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--all-repos',
				'--token',
				't',
				'--format',
				'json',
				'--skip-rules',
				'org/*',
			]);

			assert.equal(code1, 1);
			const baselineData = stdoutText();
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, baselineData);

			// Second run: same scan against the baseline → exit 0.
			nock.cleanAll();
			captureOutput();
			mockFleetWithOneRepo();

			const code2 = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--all-repos',
				'--token',
				't',
				'--format',
				'json',
				'--skip-rules',
				'org/*',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code2, 0);
			assert.match(stderrText(), /baseline:.*0 new/);
		},
	);

	test(
		'--baseline exits 1 when a rule errored, even without --fail-on-skip',
		async () => {
			captureOutput();
			mockRepoScan();

			// First run: healthy scan captured as the baseline.
			const code1 = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
			]);

			assert.equal(code1, 1);

			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, stdoutText());

			/*
			 * Second run: access/codeowners-valid errors on the malformed
			 * payload (errors: undefined) while every finding is
			 * unchanged — the gate must still fail, because an errored
			 * rule cannot prove "no new findings". The interceptor is
			 * registered before mockRepoScan's 404 so it wins the match;
			 * a 500 would not work — the octokit retry plugin would
			 * retry it and land on the 404.
			 */
			nock.cleanAll();
			captureOutput();
			nock(BASE)
				.get('/repos/sheplu/Octolens/codeowners/errors')
				.reply(200, []);
			mockRepoScan();

			const code2 = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code2, 1);
			assert.match(stderrText(), /baseline:.*0 new/);
			assert.match(stderrText(), /errored/);
		},
	);

	test(
		'--baseline on a fleet scan exits 1 when a rule errored',
		async () => {
			captureOutput();
			mockFleetWithOneRepo();

			// First run: healthy scan captured as the baseline.
			const code1 = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--all-repos',
				'--token',
				't',
				'--format',
				'json',
				'--skip-rules',
				'org/*',
			]);

			assert.equal(code1, 1);

			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const baselinePath = join(dir, 'baseline.json');

			writeFileSync(baselinePath, stdoutText());

			nock.cleanAll();
			captureOutput();

			/*
			 * Registered first so it wins; the malformed payload makes
			 * access/codeowners-valid error (see the repo-mode test above).
			 */
			nock(BASE)
				.get('/repos/silverwalls-labs/test-repo/codeowners/errors')
				.reply(200, []);
			mockFleetWithOneRepo();

			const code2 = await main([
				'scan',
				'--org',
				'silverwalls-labs',
				'--all-repos',
				'--token',
				't',
				'--format',
				'json',
				'--skip-rules',
				'org/*',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code2, 1);
			assert.match(stderrText(), /baseline:.*0 new/);
			assert.match(stderrText(), /errored/);
		},
	);

	test(
		'--baseline for a different repository exits 2',
		async () => {
			captureOutput();

			const baselinePath = writeBaseline(repoBaselineData({
				target: {
					type: 'repo', owner: 'someone-else', name: 'other-repo',
				},
			}));

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code, 2);
			assert.match(
				stderrText(),
				/was produced for repo "someone-else\/other-repo"/,
			);
			assert.equal(stdoutText(), '', 'no scan output when the baseline is rejected');
		},
	);

	test(
		'--baseline warns when the baseline threshold differs from the scan',
		async () => {
			captureOutput();
			mockRepoScan();

			const baselinePath = writeBaseline(repoBaselineData({
				threshold: 'low',
			}));

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
			]);

			assert.equal(code, 1);
			assert.match(stderrText(), /produced with --severity low/);
		},
	);

	test(
		'--baseline exits 2 when --out would overwrite the baseline',
		async () => {
			captureOutput();

			const baselinePath = writeBaseline(repoBaselineData());

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
				'--out',
				baselinePath,
			]);

			assert.equal(code, 2);
			assert.match(
				stderrText(),
				/--out and --baseline must not point to the same file/,
			);
		},
	);

	test(
		'--baseline allows --out to a different non-existent path',
		async () => {
			captureOutput();
			mockRepoScan();

			const baselinePath = writeBaseline(repoBaselineData());
			const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

			tempDirs.push(dir);
			const outPath = join(dir, 'new-report.json');

			const code = await main([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--token',
				't',
				'--format',
				'json',
				'--baseline',
				baselinePath,
				'--out',
				outPath,
			]);

			assert.ok(code === 0 || code === 1);
			assert.doesNotMatch(stderrText(), /must not point to the same file/);
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

/** Write a baseline JSON object into a fresh temp dir, returning its path. */
function writeBaseline(data: unknown): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-bl-'));

	tempDirs.push(dir);
	const path = join(dir, 'baseline.json');

	writeFileSync(path, JSON.stringify(data));

	return path;
}

/** Build a valid empty repo baseline for sheplu/Octolens. */
function repoBaselineData(options: {
	target?: Record<string, unknown>;
	threshold?: string;
} = {}): Record<string, unknown> {
	return {
		schemaVersion: 1,
		target: options.target ??
			{
				type: 'repo', owner: 'sheplu', name: 'Octolens',
			},
		threshold: options.threshold ?? 'high',
		runs: [],
		findings: [],
		summary: {
			rulesRun: 0,
			rulesErrored: 0,
			rulesSkipped: 0,
			findingsTotal: 0,
			findingsBySeverity: {
				critical: 0, high: 0, medium: 0, low: 0, info: 0,
			},
		},
	};
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

	/*
	 * 404 (no CODEOWNERS) skips cleanly; the catch-all's 200 [] would
	 * make access/codeowners-valid error out instead.
	 */
	nock(BASE)
		.get('/repos/sheplu/Octolens/codeowners/errors')
		.reply(404, { message: 'Not Found' });
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

function mockFleetWithOneRepo(): void {
	const repo = {
		...makeRepoResponse(),
		'name': 'test-repo',
		'full_name': 'silverwalls-labs/test-repo',
		'owner': { login: 'silverwalls-labs' },
		'private': true,
		'visibility': 'private',
	};

	nock(BASE)
		.get('/orgs/silverwalls-labs/repos')
		.query(true)
		.reply(200, [ repo ]);
	nock(BASE)
		.get('/repos/silverwalls-labs/test-repo')
		.reply(200, repo);
	nock(BASE)
		.get('/repos/silverwalls-labs/test-repo/branches/main/protection')
		.reply(404, { message: 'Branch not protected' });
	nock(BASE)
		.get('/repos/silverwalls-labs/test-repo/codeowners/errors')
		.reply(404, { message: 'Not Found' });
	nock(BASE).persist()
		.get(/\/repos\/silverwalls-labs\/test-repo\//)
		.reply(200, []);
	nock(BASE).persist()
		.head(/\/repos\/silverwalls-labs\/test-repo\//)
		.reply(204);
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
