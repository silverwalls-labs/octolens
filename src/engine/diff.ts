import type {
	Finding, OrgScanReport, ScanResult, Severity,
} from '../types/index.ts';
import { SEVERITIES } from '../types/index.ts';
import { subjectLabel } from '../output/subject.ts';

/** Counts of findings in each diff category. */
export type DiffSummary = {
	added: number;
	removed: number;
	unchanged: number;
};

/** The result of diffing current findings against a baseline. */
export type DiffOutcome = {
	/** Findings in the current scan that were not present in the baseline. */
	added: Finding[];

	/** Aggregate counts for the diff. */
	summary: DiffSummary;
};

/**
 * Compute the fingerprint that identifies a finding across scans.
 *
 * Combines `ruleId`, the subject label (`owner/name` or org login), and
 * `title`. Does **not** include an occurrence index — that would make
 * matching fragile when sibling findings are added or removed.
 *
 * @param finding - The finding to fingerprint.
 * @returns       A string of the form `ruleId:subject:title`.
 */
export function fingerprint(finding: Finding): string {
	return `${finding.ruleId}:${subjectLabel(finding)}:${finding.title}`;
}

/**
 * Diff two finding arrays, returning only the findings in `current` that
 * are new relative to `baseline`.
 *
 * Uses a count-based multimap so duplicate fingerprints (same rule,
 * subject, and title appearing N times) are handled correctly: each
 * current match consumes one baseline slot.
 *
 * @param baseline - Findings from the prior scan.
 * @param current  - Findings from the current scan.
 * @returns        The new findings and aggregate diff counts.
 */
export function diffFindings(
	baseline: readonly Finding[],
	current: readonly Finding[],
): DiffOutcome {
	const counts = new Map<string, number>();

	for (const finding of baseline) {
		const key = fingerprint(finding);

		counts.set(key, (counts.get(key) ?? 0) + 1);
	}

	const added: Finding[] = [];
	let unchanged = 0;

	for (const finding of current) {
		const key = fingerprint(finding);
		const remaining = counts.get(key) ?? 0;

		if (remaining > 0) {
			counts.set(key, remaining - 1);
			unchanged++;
		} else {
			added.push(finding);
		}
	}

	let removed = 0;

	for (const count of counts.values()) {
		removed += count;
	}

	return {
		added,
		summary: {
			added: added.length, removed, unchanged,
		},
	};
}

/**
 * Create a shallow copy of a scan result containing only the given findings.
 *
 * Recalculates `summary.findingsTotal` and `findingsBySeverity` to match.
 * Each rule run's `findings` array is filtered to the kept set as well.
 * Execution metadata (`status`, `error`, `skipReason`, `durationMs`) is
 * preserved — runs document what was executed, not what survived filtering.
 *
 * @param result   - The original scan result.
 * @param findings - The subset of findings to keep (by object identity).
 * @returns        A new `ScanResult` with filtered findings and updated summary.
 */
export function filterScanResult(result: ScanResult, findings: Finding[]): ScanResult {
	const kept = new Set(findings);

	const runs = result.runs.map((run) => ({
		...run,
		findings: run.findings.filter((f) => kept.has(f)),
	}));

	const filtered = result.findings.filter((f) => kept.has(f));

	return {
		...result,
		runs,
		findings: filtered,
		summary: {
			...result.summary,
			...countFindings(filtered),
		},
	};
}

/**
 * Create a shallow copy of a fleet report containing only the given findings.
 *
 * Distributes findings back into their respective org / repo sub-results
 * by matching on the finding's subject. Recalculates all summaries.
 *
 * @param report   - The original fleet report.
 * @param findings - The subset of findings (new only) to keep.
 * @returns        A new `OrgScanReport` with filtered findings and updated summaries.
 */
export function filterOrgScanReport(
	report: OrgScanReport,
	findings: Finding[],
): OrgScanReport {
	const kept = new Set(findings);

	const org = filterSubResult(report.org, kept);

	const repos = report.repos.map((repo) => filterSubResult(repo, kept));

	const { findingsTotal, findingsBySeverity } = countFindings([
		...org.findings,
		...repos.flatMap((r) => r.findings),
	]);

	return {
		...report,
		org,
		repos,
		summary: {
			...report.summary,
			findingsTotal,
			findingsBySeverity,
		},
	};
}

/**
 * Filter a sub-result's findings using a pre-built kept set, avoiding
 * the double-Set construction that would occur if `filterScanResult`
 * were called directly (it builds its own Set from the array).
 *
 * @param result - The sub-result to filter.
 * @param kept   - Set of finding objects to keep.
 * @returns      A new `ScanResult` with only kept findings.
 */
function filterSubResult(result: ScanResult, kept: Set<Finding>): ScanResult {
	const runs = result.runs.map((run) => ({
		...run,
		findings: run.findings.filter((f) => kept.has(f)),
	}));

	const filtered = result.findings.filter((f) => kept.has(f));

	return {
		...result,
		runs,
		findings: filtered,
		summary: {
			...result.summary,
			...countFindings(filtered),
		},
	};
}

/**
 * Count findings and group by severity.
 *
 * @param findings - Findings to count.
 * @returns        Total and per-severity counts.
 */
function countFindings(findings: readonly Finding[]): {
	findingsTotal: number;
	findingsBySeverity: Record<Severity, number>;
} {
	const findingsBySeverity = emptySeverityCounts();

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	return { findingsTotal: findings.length, findingsBySeverity };
}

/**
 * A severity record initialised to zero for every level.
 *
 * @returns A fresh zero-count record.
 */
function emptySeverityCounts(): Record<Severity, number> {
	const counts = {} as Record<Severity, number>;

	for (const severity of SEVERITIES) {
		counts[severity] = 0;
	}

	return counts;
}
