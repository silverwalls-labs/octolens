import type { CachedFetcher } from '../types/index.ts';

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
