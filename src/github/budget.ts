import type { Octokit } from '@octokit/rest';
import type { Logger } from '../types/index.ts';

/** Extra wait after the advertised reset to absorb clock skew. */
const RESET_SKEW_MS = 2_000;

/** Fallback pause when the reset timestamp has not been observed yet. */
const FALLBACK_PAUSE_MS = 60_000;

/** Options for {@link createRateBudget}. */
export type RateBudgetOptions = {
	/** Client whose responses are observed for rate-limit headers. */
	octokit: Octokit;

	/** Pause intake when the remaining core budget drops below this. */
	reserve: number;

	/** Logger for pause/resume notifications. */
	logger: Logger;

	/** Clock in epoch milliseconds. Defaults to `Date.now`. Test injection. */
	now?: () => number;

	/** Sleep implementation. Defaults to a `setTimeout` wrapper. Test injection. */
	sleep?: (ms: number) => Promise<void>;
};

/** Last observed core rate-limit state. `null` = not observed yet. */
export type RateBudgetSnapshot = {
	remaining: number | null;
	resetAt: number | null;
};

/** Proactive rate-limit budget derived from GitHub response headers. */
export type RateBudget = {
	/**
	 * Wait until the budget allows more work. Resolves immediately while the
	 * remaining core budget is unknown or at/above the reserve; otherwise all
	 * callers share a single pause that sleeps until the advertised reset.
	 */
	acquire(): Promise<void>;

	/** Current observed state (for progress reporting). */
	snapshot(): RateBudgetSnapshot;

	/** Stop observing the client. */
	dispose(): void;
};

/**
 * Create a {@link RateBudget} that tracks `x-ratelimit-remaining` /
 * `x-ratelimit-reset` on every request the client makes (successes and
 * errors) and pauses callers before the primary limit is exhausted.
 *
 * Only `core` resource headers are considered. This complements — not
 * replaces — the reactive throttling plugin: the budget keeps a reserve so
 * in-flight scans can finish without ever reaching zero.
 *
 * @param options - Budget configuration.
 */
export function createRateBudget(options: RateBudgetOptions): RateBudget {
	const now = options.now ?? Date.now;
	const sleep = options.sleep ?? defaultSleep;

	let remaining: number | null = null;
	let resetAt: number | null = null;
	let pause: Promise<void> | null = null;

	function observeHeaders(headers: unknown): void {
		if (headers === null || typeof headers !== 'object') {
			return;
		}

		const h = headers as Record<string, unknown>;
		const resource = h['x-ratelimit-resource'];

		if (typeof resource === 'string' && resource !== 'core') {
			return;
		}

		const seen = toCount(h['x-ratelimit-remaining']);
		const reset = toCount(h['x-ratelimit-reset']);

		if (seen !== null) {
			remaining = seen;
		}
		if (reset !== null) {
			resetAt = reset * 1000;
		}
	}

	async function wrapRequest(
		request: (opts: unknown) => Promise<{ headers?: unknown; }>,
		requestOptions: unknown,
	): Promise<{ headers?: unknown; }> {
		try {
			const response = await request(requestOptions);

			observeHeaders(response.headers);

			return response;
		} catch (err: unknown) {
			observeHeaders((err as { response?: { headers?: unknown; }; }).response?.headers);
			throw err;
		}
	}

	/*
	 * The hook signature is request-specific; the narrow structural type
	 * above only reads headers, so the cast is safe.
	 */
	options.octokit.hook.wrap('request', wrapRequest as never);

	function clearPause(): void {
		pause = null;
	}

	function pauseUntilReset(): Promise<void> {
		pause ??= doPause().finally(clearPause);

		return pause;
	}

	async function doPause(): Promise<void> {
		const waitMs = resetAt !== null ?
			Math.max(0, resetAt - now()) + RESET_SKEW_MS :
			FALLBACK_PAUSE_MS;
		const resumeAt = new Date(now() + waitMs).toISOString();

		const message = `rate budget low (${remaining} remaining < reserve ` +
			`${options.reserve}); pausing until ${resumeAt} (~${formatDuration(waitMs)})`;

		options.logger.warn(message);

		await sleep(waitMs);

		/*
		 * The window has (presumably) reset; treat the budget as unknown
		 * until the next response confirms it.
		 */
		remaining = null;
		resetAt = null;
		options.logger.info('rate budget window reset; resuming');
	}

	return {
		async acquire(): Promise<void> {
			while (remaining !== null && remaining < options.reserve) {
				await pauseUntilReset();
			}
		},

		snapshot(): RateBudgetSnapshot {
			return { remaining, resetAt };
		},

		dispose(): void {
			options.octokit.hook.remove('request', wrapRequest as never);
		},
	};
}

/**
 * Parse a rate-limit header value into a number, or `null` when unusable.
 *
 * @param value - Header value to parse.
 * @returns     The parsed number, or `null`.
 */
function toCount(value: unknown): number | null {
	const parsed = typeof value === 'string' ?
		Number.parseInt(value, 10) :
		typeof value === 'number' ?
			value :
			Number.NaN;

	return Number.isFinite(parsed) ?
		parsed :
		null;
}

/**
 * Format a millisecond duration as `Xm Ys` or `Ys`.
 *
 * @param ms - Duration in milliseconds.
 * @returns  The formatted duration.
 */
function formatDuration(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return minutes > 0 ?
		`${minutes}m ${seconds}s` :
		`${seconds}s`;
}

/**
 * Timer-based sleep used when the caller injects no custom implementation.
 *
 * @param ms - Duration in milliseconds.
 * @returns  Promise resolving after the delay.
 */
function defaultSleep(ms: number): Promise<void> {
	return new Promise((resolve) => setTimeout(resolve, ms));
}
