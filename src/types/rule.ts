import type { Octokit } from '@octokit/rest';
import type { Finding, RepoRef } from './finding.ts';
import type { Severity } from './severity.ts';

/** Audit domain a rule belongs to. */
export type RuleCategory = 'repo-config' | 'security' | 'access' | 'cicd';

/** Structured logger consumed by the engine and rules. */
export type Logger = {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
};

/**
 * Async key-value cache that deduplicates concurrent requests.
 *
 * If the loader rejects, the entry is evicted so the next call retries.
 */
export type CachedFetcher = {
	fetch<T>(key: string, loader: () => Promise<T>): Promise<T>;
};

/** Arbitrary key-value bag forwarded into every rule's context. */
export type RuleConfigBag = Record<string, unknown>;

/** Dependencies injected into every {@link Rule.check} call. */
export type RuleContext = {
	/** Target repository. */
	repo: RepoRef;

	/** Authenticated Octokit client. */
	octokit: Octokit;

	/** Per-scan cache shared across all rules. */
	cache: CachedFetcher;

	/** Logger instance. */
	logger: Logger;

	/** Rule-specific configuration from the user. */
	ruleConfig: RuleConfigBag;
};

/**
 * Contract every audit rule must satisfy.
 *
 * A rule that cannot run should throw {@link RuleSkipped} (via the
 * {@link skip} helper), not return an empty array — an empty array
 * means "pass".
 */
export type Rule = {
	/** Unique machine identifier (e.g. `"repo-config/block-force-push"`). */
	id: string;

	/** Audit domain this rule belongs to. */
	category: RuleCategory;

	/** Severity used when the config does not override it. */
	defaultSeverity: Severity;

	/** One-line human-readable description. */
	summary: string;

	/** Longer documentation string. */
	docs: string;

	/** Run the check and return zero or more findings. */
	check(context: RuleContext): Promise<Finding[]>;
};
