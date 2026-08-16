import {
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import nock from 'nock';
import {
	createOctokit,
	makeRateLimitHandler,
	makeSecondaryRateLimitHandler,
} from '../../../src/github/client.ts';

beforeEach(disableNet);

function disableNet() {
	nock.disableNetConnect();
}

afterEach(restoreNet);

function restoreNet() {
	nock.cleanAll();
	nock.enableNetConnect();
}

function makeRecordingLogger() {
	const warnings: string[] = [];

	return {
		warnings,
		logger: {
			debug: noop,
			info: noop,
			warn(message: string) {
				warnings.push(message);
			},
			error: noop,
		},
	};
}

function noop() {
	/* intentional no-op */
}

test('createOctokit sends the default user agent', defaultUserAgent);

async function defaultUserAgent() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.matchHeader('user-agent', /^octolens /)
		.reply(200, { full_name: 'sheplu/Octolens' });

	const octokit = createOctokit({ token: 't' });
	const response = await octokit.rest.repos.get({ owner: 'sheplu', repo: 'Octolens' });

	assert.equal(response.status, 200);
}

test('createOctokit honours an explicit user agent', explicitUserAgent);

async function explicitUserAgent() {
	nock('https://api.github.com')
		.get('/repos/sheplu/Octolens')
		.matchHeader('user-agent', /^octolens\/1\.2\.3 /)
		.reply(200, { full_name: 'sheplu/Octolens' });

	const octokit = createOctokit({ token: 't', userAgent: 'octolens/1.2.3' });
	const response = await octokit.rest.repos.get({ owner: 'sheplu', repo: 'Octolens' });

	assert.equal(response.status, 200);
}

test('createOctokit honours a custom base URL', customBaseUrl);

async function customBaseUrl() {
	nock('https://ghe.example.com')
		.get('/api/v3/repos/sheplu/Octolens')
		.reply(200, { full_name: 'sheplu/Octolens' });

	const octokit = createOctokit({
		token: 't',
		baseUrl: 'https://ghe.example.com/api/v3',
	});
	const response = await octokit.rest.repos.get({ owner: 'sheplu', repo: 'Octolens' });

	assert.equal(response.status, 200);
}

test('the rate-limit handler retries below the cap and stops at it', rateLimitHandler);

function rateLimitHandler() {
	const { warnings, logger } = makeRecordingLogger();
	const handler = makeRateLimitHandler(logger, 2);
	const request = { method: 'GET', url: '/repos/sheplu/Octolens' };

	assert.equal(handler(30, request, undefined, 0), true);
	assert.equal(handler(30, request, undefined, 1), true);
	assert.equal(handler(30, request, undefined, 2), false);
	assert.equal(warnings.length, 3);
	assert.match(warnings[0], /Rate limit on GET \/repos\/sheplu\/Octolens/);
}

test('the rate-limit handler tolerates a missing logger', rateLimitHandlerNoLogger);

function rateLimitHandlerNoLogger() {
	const handler = makeRateLimitHandler(undefined, 2);

	assert.equal(handler(30, { method: 'GET', url: '/x' }, undefined, 0), true);
}

test('the secondary limit handler retries once at most', secondaryLimitHandler);

function secondaryLimitHandler() {
	const { warnings, logger } = makeRecordingLogger();
	const handler = makeSecondaryRateLimitHandler(logger, 1);
	const request = { method: 'POST', url: '/graphql' };

	assert.equal(handler(60, request, undefined, 0), true);
	assert.equal(handler(60, request, undefined, 1), false);
	assert.equal(warnings.length, 2);
	assert.match(warnings[0], /Secondary limit on POST \/graphql/);
}

test('the secondary limit handler tolerates a missing logger', secondaryHandlerNoLogger);

function secondaryHandlerNoLogger() {
	const handler = makeSecondaryRateLimitHandler(undefined, 1);

	assert.equal(handler(60, { method: 'GET', url: '/x' }, undefined, 1), false);
}
