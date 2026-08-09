import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createCachedFetcher } from '../../src/github/fetcher.ts';

test('cached fetcher dedupes by key', testDedupes);

async function testDedupes() {
	const cache = createCachedFetcher();
	let calls = 0;

	async function loader() {
		calls++;

		return 42;
	}

	const a = await cache.fetch('k', loader);
	const b = await cache.fetch('k', loader);

	assert.equal(a, 42);
	assert.equal(b, 42);
	assert.equal(calls, 1);
}

test('cached fetcher does not cache rejection', testRetriesOnReject);

async function testRetriesOnReject() {
	const cache = createCachedFetcher();
	let calls = 0;

	async function loader() {
		calls++;
		if (calls === 1) {
			throw new Error('boom');
		}

		return 'ok';
	}

	await assert.rejects(cache.fetch('k', loader));
	const value = await cache.fetch('k', loader);

	assert.equal(value, 'ok');
	assert.equal(calls, 2);
}
