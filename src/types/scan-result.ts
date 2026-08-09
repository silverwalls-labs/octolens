import type { Finding } from './finding.ts';
import type { Severity } from './severity.ts';

export type RuleRunStatus = 'ok' | 'error' | 'skipped';

export type RuleRun = {
	ruleId: string;
	status: RuleRunStatus;
	findings: Finding[];
	error?: string;
	skipReason?: string;
	durationMs: number;
};

export type ScanSummary = {
	rulesRun: number;
	rulesErrored: number;
	rulesSkipped: number;
	findingsTotal: number;
	findingsBySeverity: Record<Severity, number>;
};

export type ScanResult = {
	schemaVersion: 1;
	target: {
		type: 'repo'; owner: string; name: string;
	} |
	{ type: 'org'; org: string; };
	threshold: Severity;
	runs: RuleRun[];
	findings: Finding[];
	summary: ScanSummary;
};
