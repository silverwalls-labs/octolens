import {
	describe,
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

describe('scan pipeline', () => {
	beforeEach(() => {
		nock.disableNetConnect();
	});

	afterEach(() => {
		nock.cleanAll();
		nock.enableNetConnect();
	});

	test('full scan with all rules produces valid results', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const result = await runFullScan();

		assert.equal(result.schemaVersion, 1);
		assert.equal(result.target.owner, 'sheplu');
		assert.ok(result.summary.rulesRun >= 40);
		assert.ok(result.summary.rulesErrored <= result.summary.rulesRun);
	});

	test('JSON formatter produces parseable output from full scan', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const result = await runFullScan();
		const json = formatJson(result);
		const parsed = JSON.parse(json);

		assert.equal(parsed.schemaVersion, 1);
		assert.equal(parsed.target.owner, 'sheplu');
		assert.equal(typeof parsed.summary.rulesRun, 'number');
	});

	test('markdown formatter produces valid output from full scan', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const result = await runFullScan();
		const md = formatMarkdown(result);

		assert.match(md, /# Octolens scan — sheplu\/Octolens/);
	});

	test('pretty formatter produces valid output from full scan', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const result = await runFullScan();
		const pretty = formatPretty(result, { color: false });

		assert.match(pretty, /sheplu\/Octolens/);
		assert.match(pretty, /Summary/);
	});

	test('exitCodeFor returns 1 when findings exist', async () => {
		mockRepoMetadata();
		nock(BASE)
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(404, { message: 'Branch not protected' });
		mockCatchAll();

		const result = await runFullScan();
		const code = exitCodeFor(result);

		assert.equal(code, 1);
		assert.ok(result.summary.findingsTotal > 0);
	});

	test('exitCodeFor returns 0 when no findings at threshold', async () => {
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
	});

	test('--fail-on-skip: exitCodeFor returns 1 when rules skipped', async () => {
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
	});

	test('500 from all endpoints produces errored rules, not a crash', async () => {
		nock(BASE).persist().get(/.*/)
			.reply(500, { message: 'Internal Server Error' });
		nock(BASE).persist().head(/.*/)
			.reply(500, { message: 'Internal Server Error' });

		const result = await runFullScan();

		assert.ok(result.summary.rulesErrored > 0);
		assert.ok(result.summary.rulesRun > 0);
	});

	test('archived repo is skipped by default', async () => {
		nock(BASE)
			.get('/repos/sheplu/Octolens')
			.reply(200, { ...makeRepoResponse(), archived: true });

		const result = await scanRepo({
			repo: { owner: 'sheplu', name: 'Octolens' },
			rules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'high',
		});

		assert.equal(result.summary.rulesRun, 0);
		assert.ok(result.summary.rulesSkipped > 0);
		assert.equal(result.findings.length, 0);
	});

	test('archived repo is scanned when ignore.archived is false', async () => {
		nock(BASE)
			.get('/repos/sheplu/Octolens')
			.reply(200, { ...makeRepoResponse(), archived: true });
		mockProtected();
		mockCatchAll();

		const result = await scanRepo({
			repo: { owner: 'sheplu', name: 'Octolens' },
			rules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'high',
			config: { ignore: { archived: false } },
		});

		assert.ok(result.summary.rulesRun > 0);
	});

	test(
		'unprotected branch produces critical finding and skips dependent rules',
		async () => {
			mockRepoMetadata();
			nock(BASE)
				.get('/repos/sheplu/Octolens/branches/main/protection')
				.reply(404, { message: 'Branch not protected' });
			mockCatchAll();

			const result = await runFullScan();

			const ruleId = 'repo-config/branch-protection-required';
			const bpr = result.findings.find((f) => f.ruleId === ruleId);

			assert.ok(bpr);
			assert.equal(bpr.severity, 'critical');
			assert.ok(result.summary.rulesSkipped >= 9);

			const skippedRuns = result.runs.filter((r) => r.status === 'skipped');

			for (const run of skippedRuns) {
				assert.equal(
					run.skipReason,
					'default branch has no protection rule',
				);
			}
		},
	);

	test('JSON output round-trips through parse', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const result = await runFullScan();
		const json = formatJson(result);
		const parsed = JSON.parse(json) as ScanResult;

		assert.equal(parsed.schemaVersion, result.schemaVersion);
		assert.equal(parsed.summary.rulesRun, result.summary.rulesRun);
		assert.equal(
			parsed.summary.findingsTotal,
			result.summary.findingsTotal,
		);
		assert.equal(parsed.findings.length, result.findings.length);
		assert.equal(parsed.runs.length, result.runs.length);
	});

	test(
		'markdown output contains severity table and findings section',
		async () => {
			mockRepoMetadata();
			nock(BASE)
				.get('/repos/sheplu/Octolens/branches/main/protection')
				.reply(404, { message: 'Branch not protected' });
			mockCatchAll();

			const result = await runFullScan();
			const md = formatMarkdown(result);

			assert.match(md, /\| Severity \| Count \|/);
			assert.match(md, /## Findings/);
			assert.match(md, /branch-protection-required/);
		},
	);

	test('pretty output contains summary section', async () => {
		mockRepoMetadata();
		nock(BASE)
			.get('/repos/sheplu/Octolens/branches/main/protection')
			.reply(404, { message: 'Branch not protected' });
		mockCatchAll();

		const result = await runFullScan();
		const pretty = formatPretty(result, { color: false });

		assert.match(pretty, /CRITICAL/);
		assert.match(pretty, /Summary/);
		assert.match(pretty, /passed .* flagged .* skipped/);
	});

	test('threshold filters out lower-severity findings', async () => {
		mockRepoMetadata();
		mockProtected();
		mockCatchAll();

		const highResult = await scanRepo({
			repo: { owner: 'sheplu', name: 'Octolens' },
			rules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'high',
		});
		const critResult = await scanRepo({
			repo: { owner: 'sheplu', name: 'Octolens' },
			rules: [ ...allRules ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'critical',
		});

		assert.ok(highResult.summary.findingsTotal >=
			critResult.summary.findingsTotal);
	});

	test(
		'403 on branch protection skips dependent rules gracefully',
		async () => {
			mockRepoMetadata();
			nock(BASE)
				.get('/repos/sheplu/Octolens/branches/main/protection')
				.reply(403, {
					message: 'Resource not accessible by integration',
				});
			mockCatchAll();

			const result = await runFullScan();

			assert.ok(result.summary.rulesSkipped >= 9);

			const reason = 'default branch has no protection rule';
			const branchRules = result.runs.filter((r) => r.skipReason === reason);

			assert.ok(branchRules.length >= 9);
		},
	);
});

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
			required_pull_request_reviews: {
				required_approving_review_count: 1,
			},
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
