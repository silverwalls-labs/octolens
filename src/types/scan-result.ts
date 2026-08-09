import type { Finding } from './finding.ts';
import type { Severity } from './severity.ts';

/** Outcome of a single rule execution. */
export type RuleRunStatus = 'ok' | 'error' | 'skipped';

/** The result of executing a single rule against a repository. */
export type RuleRun = {
	/** ID of the rule that was executed. */
	ruleId: string;

	/** `'ok'` on success, `'error'` on exception, `'skipped'` on {@link RuleSkipped}. */
	status: RuleRunStatus;

	/** Findings produced by this rule (empty when skipped or errored). */
	findings: Finding[];

	/** Error message when `status` is `'error'`. */
	error?: string;

	/** Reason the rule was skipped when `status` is `'skipped'`. */
	skipReason?: string;

	/** Wall-clock execution time in milliseconds. */
	durationMs: number;
};

/** Aggregate statistics for a scan result. */
export type ScanSummary = {
	rulesRun: number;
	rulesErrored: number;
	rulesSkipped: number;
	findingsTotal: number;

	/** Finding count per severity level (all five keys are always present). */
	findingsBySeverity: Record<Severity, number>;
};

/** Complete output of a scan. */
export type ScanResult = {
	/** Schema version for forward compatibility (currently always `1`). */
	schemaVersion: 1;

	/** What was scanned — a single repo or an organisation. */
	target: {
		type: 'repo'; owner: string; name: string;
	} |
	{ type: 'org'; org: string; };

	/** Only findings at or above this severity appear in {@link findings}. */
	threshold: Severity;

	/** Every rule execution including errors and skips. */
	runs: RuleRun[];

	/** Findings that met the {@link threshold}. */
	findings: Finding[];

	/** Aggregate counts. */
	summary: ScanSummary;
};
