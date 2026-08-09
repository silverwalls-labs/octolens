import type { CachedFetcher } from '../types/index.ts';

/**
 * Create a new in-memory {@link CachedFetcher}.
 *
 * The cache stores promises, so concurrent calls for the same key share a
 * single in-flight request. If the loader rejects, the entry is evicted so
 * the next call retries. There is no TTL or size limit — the cache lives
 * for the lifetime of the returned object (typically one scan).
 */
export function createCachedFetcher(): CachedFetcher {
	const cache = new Map<string, Promise<unknown>>();

	return {
		fetch<T>(key: string, loader: () => Promise<T>): Promise<T> {
			const existing = cache.get(key);

			if (existing) {
				return existing as Promise<T>;
			}

			const pending = loader().catch(makeEvictOnError(cache, key));

			cache.set(key, pending);

			return pending;
		},
	};
}

function makeEvictOnError(cache: Map<string, Promise<unknown>>, key: string) {
	return function evictOnError(err: unknown): never {
		cache.delete(key);
		throw err;
	};
}
