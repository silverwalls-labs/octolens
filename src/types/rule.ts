import type { Octokit } from '@octokit/rest';
import type { Finding, RepoRef } from './finding.ts';
import type { Severity } from './severity.ts';

/** Audit domain a rule belongs to. */
export type RuleCategory = 'repo-config' | 'security' | 'access' | 'cicd' | 'org';

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

/** Dependencies injected into every {@link Rule}'s `check()` call. */
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

/** Descriptive fields shared by repo-scoped and org-scoped rules. */
export type RuleMetadata = {
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
};

/**
 * Contract every repo-scoped audit rule must satisfy.
 *
 * A rule that cannot run should throw {@link RuleSkipped} (via the
 * {@link skip} helper), not return an empty array — an empty array
 * means "pass".
 */
export type Rule = RuleMetadata & {
	/** Run the check and return zero or more findings. */
	check(context: RuleContext): Promise<Finding[]>;
};

/** Dependencies injected into every {@link OrgRule}'s `check()` call. */
export type OrgRuleContext = {
	/** Target organisation login. */
	org: string;

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
 * Contract for rules whose subject is the organisation itself rather than
 * a repository inside it.
 *
 * Same pass/skip semantics as {@link Rule}: an empty array means "pass",
 * a rule that cannot run should throw {@link RuleSkipped} via {@link skip}.
 */
export type OrgRule = RuleMetadata & {
	/** Org rules always belong to the `'org'` category. */
	category: 'org';

	/** Run the check and return zero or more findings. */
	check(context: OrgRuleContext): Promise<Finding[]>;
};
