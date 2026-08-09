import type { ScanResult } from '../types/index.ts';

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
 * @param result - The scan result to evaluate.
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

function isIncomplete(result: ScanResult): boolean {
	return result.summary.rulesErrored > 0 || result.summary.rulesSkipped > 0;
}
