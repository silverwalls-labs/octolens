import type { Severity } from './severity.ts';

/** Per-rule override: a severity level or `'off'` to disable entirely. */
export type RuleSetting = Severity | 'off';

/** Top-level user configuration for a scan. */
export type OctolensConfig = {
	/** Map rule IDs to severity overrides or `'off'`. */
	rules?: Record<string, RuleSetting>;

	/** Controls which repositories are skipped. */
	ignore?: {
		/** Repositories to skip entirely (as `"owner/name"`). */
		repos?: string[];

		/** Skip archived repositories. Defaults to `true`. */
		archived?: boolean;

		/** Skip forked repositories. */
		forks?: boolean;
	};

	/** Organisation-level scan settings. */
	org?: {
		/** Maximum number of repos to scan concurrently. */
		concurrency?: number;
	};
};
