import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { Logger } from '../types/index.ts';

const OctolensOctokit = Octokit.plugin(retry, throttling);

type ThrottleRequest = {
	method: string;
	url: string;
};

/** Options for {@link createOctokit}. */
export type ClientOptions = {
	/** GitHub token for authentication. */
	token: string;

	/** Base URL for GitHub API (defaults to `https://api.github.com`). */
	baseUrl?: string;

	/** User-Agent header value. Defaults to `'octolens'`. */
	userAgent?: string;

	/** Logger for rate-limit warnings. */
	logger?: Logger;
};

/**
 * Create a configured Octokit instance with retry and throttling plugins.
 *
 * Retries up to 2 times on primary rate limits and 1 time on secondary
 * (abuse) rate limits, logging a warning on each retry.
 *
 * @param options - Client configuration.
 * @returns An authenticated Octokit instance.
 */
export function createOctokit(options: ClientOptions): Octokit {
	const log = options.logger;

	return new OctolensOctokit({
		auth: options.token,
		baseUrl: options.baseUrl,
		userAgent: options.userAgent ?? 'octolens',
		throttle: {
			onRateLimit: makeRateLimitHandler(log, 2),
			onSecondaryRateLimit: makeSecondaryRateLimitHandler(log, 1),
		},
	});
}

/**
 * Build the primary rate-limit callback handed to the throttling plugin.
 *
 * @internal Exported for direct testing only.
 */
export function makeRateLimitHandler(log: Logger | undefined, maxRetries: number) {
	return function onRateLimit(
		retryAfter: number,
		req: ThrottleRequest,
		_octokit: unknown,
		retryCount: number,
	): boolean {
		log?.warn(`Rate limit on ${req.method} ${req.url}; retry #${retryCount} in ${retryAfter}s`);

		return retryCount < maxRetries;
	};
}

/**
 * Build the secondary (abuse) rate-limit callback handed to the throttling plugin.
 *
 * @internal Exported for direct testing only.
 */
export function makeSecondaryRateLimitHandler(log: Logger | undefined, maxRetries: number) {
	return function onSecondaryRateLimit(
		retryAfter: number,
		req: ThrottleRequest,
		_octokit: unknown,
		retryCount: number,
	): boolean {
		const where = `${req.method} ${req.url}`;

		log?.warn(`Secondary limit on ${where}; retry #${retryCount} in ${retryAfter}s`);

		return retryCount < maxRetries;
	};
}
