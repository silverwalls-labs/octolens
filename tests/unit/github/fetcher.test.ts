import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import {
	createCachedFetcher, createScopedCache,
} from '../../../src/github/fetcher.ts';

describe('createCachedFetcher', () => {
	test('cached fetcher dedupes by key', async () => {
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
	});

	test(
		'cached fetcher does not cache rejection',
		async () => {
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
		},
	);

	test(
		'scoped cache routes shared prefixes to the parent',
		async () => {
			const parent = createCachedFetcher();
			const scopedA = createScopedCache(parent, [ 'org-property-schema:' ]);
			const scopedB = createScopedCache(parent, [ 'org-property-schema:' ]);
			let calls = 0;

			async function loader() {
				calls++;

				return 'schema';
			}

			const a = await scopedA.fetch('org-property-schema:acme', loader);
			const b = await scopedB.fetch('org-property-schema:acme', loader);

			assert.equal(a, 'schema');
			assert.equal(b, 'schema');
			assert.equal(calls, 1);
		},
	);

	test(
		'scoped cache keeps other keys private per scope',
		async () => {
			const parent = createCachedFetcher();
			const scopedA = createScopedCache(parent, [ 'org-property-schema:' ]);
			const scopedB = createScopedCache(parent, [ 'org-property-schema:' ]);
			let calls = 0;

			async function loader() {
				calls++;

				return calls;
			}

			const a = await scopedA.fetch('repo-metadata:acme/one', loader);
			const b = await scopedB.fetch('repo-metadata:acme/one', loader);

			assert.equal(a, 1);
			assert.equal(b, 2);
			assert.equal(calls, 2);
		},
	);
});
