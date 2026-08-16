import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { createRateBudget } from '../../../src/github/budget.ts';
import { disableNet, restoreNet } from '../../helpers/context.ts';
import type { Logger } from '../../../src/types/index.ts';

const BASE = 'https://api.github.com';

/** Fixed clock: reset header is 100s in the future. */
const NOW_MS = 1_700_000_000_000;
const RESET_EPOCH_S = 1_700_000_100;

function noop() {
	/* intentional no-op */
}

type Recorded = {
	logger: Logger;
	warnings: string[];
	sleeps: number[];
	sleep: (ms: number) => Promise<void>;
};

function makeRecorded(): Recorded {
	const warnings: string[] = [];
	const sleeps: number[] = [];

	function recordWarning(message: string): void {
		warnings.push(message);
	}

	async function recordSleep(ms: number): Promise<void> {
		sleeps.push(ms);
	}

	return {
		warnings,
		sleeps,
		logger: {
			debug: noop,
			info: noop,
			warn: recordWarning,
			error: noop,
		},
		sleep: recordSleep,
	};
}

function makeOctokit(): Octokit {
	return new Octokit({ auth: 'test-token', request: { retries: 0 } });
}

function rateHeaders(
	remaining: number,
	extra: Record<string, string> = {},
): Record<string, string> {
	return {
		'x-ratelimit-remaining': String(remaining),
		'x-ratelimit-reset': String(RESET_EPOCH_S),
		...extra,
	};
}

beforeEach(disableNet);
afterEach(restoreNet);

test('acquire passes through before any headers are observed', testPassThroughUnknown);

async function testPassThroughUnknown() {
	const recorded = makeRecorded();
	const budget = createRateBudget({
		octokit: makeOctokit(),
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	await budget.acquire();

	assert.deepEqual(recorded.sleeps, []);
	assert.deepEqual(budget.snapshot(), { remaining: null, resetAt: null });
}

test('acquire passes through while remaining is at or above the reserve', testPassThroughHealthy);

async function testPassThroughHealthy() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	nock(BASE).get('/repos/a/b').reply(200, {}, rateHeaders(4000));
	await octokit.rest.repos.get({ owner: 'a', repo: 'b' });

	await budget.acquire();

	assert.deepEqual(recorded.sleeps, []);
	assert.equal(budget.snapshot().remaining, 4000);
}

test('acquire pauses until reset when the budget drops below the reserve', testPausesUntilReset);

async function testPausesUntilReset() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	nock(BASE).get('/repos/a/b').reply(200, {}, rateHeaders(10));
	await octokit.rest.repos.get({ owner: 'a', repo: 'b' });

	await budget.acquire();

	// 100s until reset + 2s skew.
	assert.deepEqual(recorded.sleeps, [ 102_000 ]);
	assert.equal(recorded.warnings.length, 1);
	assert.match(recorded.warnings[0], /rate budget low \(10 remaining < reserve 50\)/);

	// After the pause the budget is unknown again — no further sleeping.
	await budget.acquire();
	assert.deepEqual(recorded.sleeps, [ 102_000 ]);
	assert.deepEqual(budget.snapshot(), { remaining: null, resetAt: null });
}

test('concurrent acquires share a single pause', testSharedPause);

async function testSharedPause() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	nock(BASE).get('/repos/a/b').reply(200, {}, rateHeaders(1));
	await octokit.rest.repos.get({ owner: 'a', repo: 'b' });

	await Promise.all([
		budget.acquire(),
		budget.acquire(),
		budget.acquire(),
	]);

	assert.equal(recorded.sleeps.length, 1);
	assert.equal(recorded.warnings.length, 1);
}

test('rate-limit headers on error responses update the budget', testErrorHeaders);

async function testErrorHeaders() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	nock(BASE).get('/repos/a/b').reply(404, { message: 'Not Found' }, rateHeaders(3));
	await assert.rejects(octokit.rest.repos.get({ owner: 'a', repo: 'b' }));

	assert.equal(budget.snapshot().remaining, 3);
}

test('non-core rate-limit headers are ignored', testNonCoreIgnored);

async function testNonCoreIgnored() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	nock(BASE).get('/repos/a/b')
		.reply(200, {}, rateHeaders(2, { 'x-ratelimit-resource': 'search' }));
	await octokit.rest.repos.get({ owner: 'a', repo: 'b' });

	await budget.acquire();

	assert.deepEqual(recorded.sleeps, []);
	assert.equal(budget.snapshot().remaining, null);
}

test('dispose stops observing the client', testDispose);

async function testDispose() {
	const recorded = makeRecorded();
	const octokit = makeOctokit();
	const budget = createRateBudget({
		octokit,
		reserve: 50,
		logger: recorded.logger,
		now: () => NOW_MS,
		sleep: recorded.sleep,
	});

	budget.dispose();

	nock(BASE).get('/repos/a/b').reply(200, {}, rateHeaders(1));
	await octokit.rest.repos.get({ owner: 'a', repo: 'b' });

	assert.equal(budget.snapshot().remaining, null);
}
