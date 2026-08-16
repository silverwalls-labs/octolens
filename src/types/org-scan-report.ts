import type { RepoRef } from './finding.ts';
import type { ScanResult } from './scan-result.ts';
import type { Severity } from './severity.ts';

/** Why a repository was excluded from the fan-out before any API spend. */
export type RepoSkipReason = 'archived' | 'fork' | 'ignored';

/** A repository excluded from the fan-out by a filter. */
export type SkippedRepo = {
	/** The repository that was skipped. */
	repo: RepoRef;

	/** Which filter excluded it. */
	reason: RepoSkipReason;
};

/** A repository whose scan failed entirely (the fan-out continued without it). */
export type FailedRepo = {
	/** The repository that failed. */
	repo: RepoRef;

	/** Error message describing the failure. */
	error: string;
};

/** Aggregate statistics for an organisation fleet scan. */
export type FleetSummary = {
	/** Repositories returned by the org listing (before filters). */
	reposDiscovered: number;

	/** Repositories fully scanned. */
	reposScanned: number;

	/** Repositories excluded by filters (archived / fork / ignore list). */
	reposSkipped: number;

	/** Repositories whose scan failed entirely. */
	reposFailed: number;

	/**
	 * `false` when the repository listing aborted mid-stream (e.g. a
	 * pagination error), meaning some repositories may be missing entirely.
	 */
	listingComplete: boolean;

	/** Rule executions across the org scan and every repo scan. */
	rulesRun: number;
	rulesErrored: number;
	rulesSkipped: number;
	findingsTotal: number;

	/** Finding count per severity level (all five keys are always present). */
	findingsBySeverity: Record<Severity, number>;
};

/**
 * Complete output of an organisation fleet scan (`--org --all-repos`):
 * the org-posture result plus one {@link ScanResult} per repository.
 */
export type OrgScanReport = {
	/** Schema version for forward compatibility (currently always `1`). */
	schemaVersion: 1;

	/** What was scanned — the organisation and its repository fleet. */
	target: { type: 'org-fleet'; org: string; };

	/** Only findings at or above this severity appear in the nested results. */
	threshold: Severity;

	/** Result of the org-posture scan (target type `'org'`). */
	org: ScanResult;

	/** One result per scanned repository, sorted by `owner/name`. */
	repos: ScanResult[];

	/** Repositories excluded by filters, sorted by `owner/name`. */
	skipped: SkippedRepo[];

	/** Repositories whose scan failed entirely, sorted by `owner/name`. */
	failures: FailedRepo[];

	/** Aggregate counts across the org and all repositories. */
	summary: FleetSummary;
};
