import { Octokit } from '@octokit/rest';
import { retry } from '@octokit/plugin-retry';
import { throttling } from '@octokit/plugin-throttling';
import type { Logger } from '../types/index.ts';

const OctolensOctokit = Octokit.plugin(retry, throttling);

type ThrottleRequest = {
	method: string;
	url: string;
};

export type ClientOptions = {
	token: string;
	baseUrl?: string;
	userAgent?: string;
	logger?: Logger;
};

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

function makeRateLimitHandler(log: Logger | undefined, maxRetries: number) {
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

function makeSecondaryRateLimitHandler(log: Logger | undefined, maxRetries: number) {
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
