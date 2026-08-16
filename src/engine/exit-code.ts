import type { OrgScanReport, ScanResult } from '../types/index.ts';

/** Options for {@link exitCodeFor}. */
export type ExitCodeOptions = {
	/** Return `1` if any rule was skipped or errored (incomplete coverage). */
	failOnIncomplete?: boolean;
};

/**
 * Determine the process exit code for a scan result.
 *
 * Returns `1` if there are any findings, or if `failOnIncomplete` is set
 * and the scan has skipped or errored rules. Returns `0` otherwise.
 *
 * @param result  - The scan result to evaluate.
 * @param options - Optional flags.
 */
export function exitCodeFor(result: ScanResult, options: ExitCodeOptions = {}): 0 | 1 {
	if (result.findings.length > 0) {
		return 1;
	}

	if (options.failOnIncomplete && isIncomplete(result)) {
		return 1;
	}

	return 0;
}

/**
 * Check whether any rule run was skipped or errored.
 *
 * @param result - Scan result to inspect.
 * @returns      True when coverage is incomplete.
 */
function isIncomplete(result: ScanResult): boolean {
	return result.summary.rulesErrored > 0 || result.summary.rulesSkipped > 0;
}

/**
 * Determine the process exit code for an organisation fleet scan report.
 *
 * Returns `1` if there are any findings across the org or its repositories,
 * or if `failOnIncomplete` is set and coverage is incomplete: skipped or
 * errored rules anywhere, repositories whose scan failed, or a truncated
 * repository listing. Returns `0` otherwise.
 *
 * @param report  - The fleet scan report to evaluate.
 * @param options - Optional flags.
 */
export function exitCodeForReport(report: OrgScanReport, options: ExitCodeOptions = {}): 0 | 1 {
	if (report.summary.findingsTotal > 0) {
		return 1;
	}

	if (options.failOnIncomplete && isReportIncomplete(report)) {
		return 1;
	}

	return 0;
}

/**
 * Check whether fleet coverage is incomplete: skipped or errored rules,
 * failed repositories, or a truncated listing.
 *
 * @param report - Fleet report to inspect.
 * @returns      True when fleet coverage is incomplete.
 */
function isReportIncomplete(report: OrgScanReport): boolean {
	return report.summary.rulesErrored > 0 ||
		report.summary.rulesSkipped > 0 ||
		report.failures.length > 0 ||
		!report.summary.listingComplete;
}
