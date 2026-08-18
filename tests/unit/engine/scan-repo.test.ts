import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { scanRepo, exitCodeFor } from '../../../src/engine/index.ts';
import {
	rule as dependabotAlertsEnabled,
} from '../../../src/rules/security/dependabot-alerts-enabled.ts';
import { makeRepoResponse } from '../../helpers/fixtures.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';

describe('scanRepo', () => {
	beforeEach(disableNet);
	afterEach(restoreNet);

	test(
		'scanRepo rolls up findings and computes summary',
		async () => {
			mockRepoMetadata();
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/vulnerability-alerts')
				.reply(404, { message: 'Not Found' });

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'high',
			});

			assert.equal(result.summary.findingsTotal, 1);
			assert.equal(
				result.summary.findingsBySeverity.high,
				1,
			);
			assert.equal(result.summary.rulesRun, 1);
			assert.equal(result.summary.rulesErrored, 0);
			assert.equal(exitCodeFor(result), 1);
		},
	);

	test(
		'scanRepo filters out findings below threshold',
		async () => {
			mockRepoMetadata();
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/vulnerability-alerts')
				.reply(404, { message: 'Not Found' });

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'critical',
			});

			assert.equal(result.findings.length, 0);
			assert.equal(result.summary.findingsTotal, 0);
			assert.equal(exitCodeFor(result), 0);
		},
	);

	test('disabled rules in config are skipped', async () => {
		mockRepoMetadata();
		const result = await scanRepo({
			repo: { owner: 'sheplu', name: 'Octolens' },
			rules: [ dependabotAlertsEnabled ],
			octokit: makeOctokit(),
			logger: silentLogger(),
			threshold: 'high',
			config: {
				rules: {
					'security/dependabot-alerts-enabled': 'off',
				},
			},
		});

		assert.equal(result.summary.rulesRun, 0);
		assert.equal(result.findings.length, 0);
	});

	test(
		'rule errors are captured without aborting the scan',
		async () => {
			mockRepoMetadata();
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/vulnerability-alerts')
				.reply(500, { message: 'Server error' });

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'high',
			});

			assert.equal(result.summary.rulesErrored, 1);
			assert.equal(result.findings.length, 0);
		},
	);

	test(
		'archived repositories are skipped by default',
		async () => {
			mockRepoMetadata(true);

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'high',
			});

			assert.equal(result.summary.rulesRun, 0);
			assert.equal(result.summary.rulesSkipped, 1);
			assert.equal(result.findings.length, 0);
			assert.equal(exitCodeFor(result), 0);
		},
	);

	test(
		'repo metadata failure does not crash the scan',
		async () => {
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens')
				.reply(500, { message: 'Internal Server Error' });
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/vulnerability-alerts')
				.reply(500, { message: 'Internal Server Error' });

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'high',
			});

			assert.equal(result.summary.rulesRun, 1);
			assert.equal(result.summary.rulesErrored, 1);
		},
	);

	test(
		'archived repositories are scanned when archived ignore is disabled',
		async () => {
			mockRepoMetadata(true);
			nock('https://api.github.com')
				.get('/repos/sheplu/Octolens/vulnerability-alerts')
				.reply(404, { message: 'Not Found' });

			const result = await scanRepo({
				repo: { owner: 'sheplu', name: 'Octolens' },
				rules: [ dependabotAlertsEnabled ],
				octokit: makeOctokit(),
				logger: silentLogger(),
				threshold: 'high',
				config: { ignore: { archived: false } },
			});

			assert.equal(result.summary.rulesRun, 1);
			assert.equal(result.summary.findingsTotal, 1);
		},
	);
});

function mockRepoMetadata(archived = false): void {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.reply(200, { ...makeRepoResponse(), archived });
}

function noop() {
	/* intentional no-op */
}

function silentLogger() {
	return {
		debug: noop,
		info: noop,
		warn: noop,
		error: noop,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({
		auth: 't',
		request: { retries: 0 },
	});
}
