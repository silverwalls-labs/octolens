import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { scanOrg, exitCodeFor } from '../../../src/engine/index.ts';
import { rule as twoFactorRequired } from '../../../src/rules/org/two-factor-required.ts';
import { makeOrgResponse } from '../../helpers/fixtures.ts';

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

beforeEach(disableNet);

function disableNet() {
	nock.disableNetConnect();
}

afterEach(restoreNet);

function restoreNet() {
	nock.cleanAll();
	nock.enableNetConnect();
}

test('scanOrg rolls up findings and computes summary', findingsCase);

async function findingsCase() {
	nock('https://api.github.com')
		.get('/orgs/silverwalls-labs')
		.reply(200, makeOrgResponse({ twoFactorRequirementEnabled: false }));

	const result = await scanOrg({
		org: 'silverwalls-labs',
		rules: [ twoFactorRequired ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.deepEqual(result.target, { type: 'org', org: 'silverwalls-labs' });
	assert.equal(result.summary.findingsTotal, 1);
	assert.equal(result.summary.findingsBySeverity.high, 1);
	assert.equal(result.summary.rulesRun, 1);
	assert.equal(result.summary.rulesErrored, 0);
	assert.equal(result.findings[0]?.org, 'silverwalls-labs');
	assert.equal(result.findings[0]?.repo, undefined);
	assert.equal(exitCodeFor(result), 1);
}

test('scanOrg filters out findings below threshold', filterCase);

async function filterCase() {
	nock('https://api.github.com')
		.get('/orgs/silverwalls-labs')
		.reply(200, makeOrgResponse({ twoFactorRequirementEnabled: false }));

	const result = await scanOrg({
		org: 'silverwalls-labs',
		rules: [ twoFactorRequired ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'critical',
	});

	assert.equal(result.findings.length, 0);
	assert.equal(result.summary.findingsTotal, 0);
	assert.equal(exitCodeFor(result), 0);
}

test('disabled org rules in config are skipped', disabledCase);

async function disabledCase() {
	const result = await scanOrg({
		org: 'silverwalls-labs',
		rules: [ twoFactorRequired ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
		config: { rules: { 'org/two-factor-required': 'off' } },
	});

	assert.equal(result.summary.rulesRun, 0);
	assert.equal(result.findings.length, 0);
}

test('non-owner tokens record skipped runs, not passes', skippedCase);

async function skippedCase() {
	nock('https://api.github.com')
		.get('/orgs/silverwalls-labs')
		.reply(200, makeOrgResponse({ privileged: false }));

	const result = await scanOrg({
		org: 'silverwalls-labs',
		rules: [ twoFactorRequired ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(result.summary.rulesRun, 1);
	assert.equal(result.summary.rulesSkipped, 1);
	assert.equal(result.findings.length, 0);
	assert.equal(exitCodeFor(result), 0);
	assert.equal(exitCodeFor(result, { failOnIncomplete: true }), 1);
}

test('org rule errors are captured without aborting the scan', errorCase);

async function errorCase() {
	nock('https://api.github.com')
		.get('/orgs/silverwalls-labs')
		.reply(500, { message: 'Server error' });

	const result = await scanOrg({
		org: 'silverwalls-labs',
		rules: [ twoFactorRequired ],
		octokit: makeOctokit(),
		logger: silentLogger(),
		threshold: 'high',
	});

	assert.equal(result.summary.rulesErrored, 1);
	assert.equal(result.findings.length, 0);
}
