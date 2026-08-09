import type { ScanResult } from '../types/index.ts';

export type ExitCodeOptions = {
	failOnIncomplete?: boolean;
};

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
