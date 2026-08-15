import { compareSeverity, SEVERITIES } from '../types/severity.ts';
import type {
	Finding, RuleRun, ScanResult, Severity,
} from '../types/index.ts';
import { subjectLabel } from './subject.ts';

const SEVERITY_LABEL: Record<Severity, string> = {
	critical: 'Critical',
	high: 'High',
	medium: 'Medium',
	low: 'Low',
	info: 'Info',
};

/**
 * Render a scan result as a Markdown report.
 *
 * Produces a heading, severity summary table, findings sorted by severity,
 * and a checks table showing pass/flagged/skipped/error status for each rule.
 *
 * @param result - The scan result to format.
 * @returns A complete Markdown document with a trailing newline.
 */
export function formatMarkdown(result: ScanResult): string {
	const targetLabel = result.target.type === 'repo' ?
		`${result.target.owner}/${result.target.name}` :
		result.target.org;

	const sections: string[] = [];

	sections.push(`# Octolens scan — ${targetLabel}`);
	sections.push(renderSummaryTable(result));

	if (result.findings.length === 0) {
		sections.push(`No findings at or above the \`${result.threshold}\` threshold.`);
	} else {
		sections.push(`## Findings (${result.findings.length})`);

		const sorted = [ ...result.findings ].sort(bySeverityDesc);

		for (const finding of sorted) {
			sections.push(renderFinding(finding));
		}
	}

	if (result.runs.length > 0) {
		sections.push(renderChecks(result));
	}

	return `${sections.join('\n\n')}\n`;
}

function renderSummaryTable(result: ScanResult): string {
	const counts = result.summary.findingsBySeverity;
	const rows = SEVERITIES.map((s) => `| ${SEVERITY_LABEL[s]} | ${counts[s]} |`);

	return [
		`Threshold: \`${result.threshold}\` — ${result.summary.rulesRun} rules run, ` +
		`${result.summary.findingsTotal} finding(s).`,
		'',
		'| Severity | Count |',
		'| --- | --- |',
		...rows,
	].join('\n');
}

function renderChecks(result: ScanResult): string {
	const sorted = [ ...result.runs ].sort(byRuleId);
	const rows = sorted.map(toCheckRow);

	const passed = sorted.filter((run) => checkOutcome(run) === 'pass').length;
	const flagged = sorted.filter((run) => checkOutcome(run) === 'flagged').length;
	const skipped = sorted.filter((run) => run.status === 'skipped').length;
	const errored = sorted.filter((run) => run.status === 'error').length;

	return [
		`## Checks (${sorted.length})`,
		`${passed} passed · ${flagged} flagged · ${skipped} skipped · ${errored} errored.`,
		'',
		'| Result | Rule | Findings |',
		'| --- | --- | --- |',
		...rows,
	].join('\n');
}

type CheckOutcome = 'pass' | 'flagged' | 'skipped' | 'error';

const OUTCOME_LABEL: Record<CheckOutcome, string> = {
	pass: '✅ pass',
	flagged: '⚠️ flagged',
	skipped: '⏭️ skipped',
	error: '❌ error',
};

function checkOutcome(run: RuleRun): CheckOutcome {
	if (run.status === 'error') {
		return 'error';
	}
	if (run.status === 'skipped') {
		return 'skipped';
	}

	return run.findings.length > 0 ?
		'flagged' :
		'pass';
}

function toCheckRow(run: RuleRun): string {
	const outcome = checkOutcome(run);
	const count = run.findings.length > 0 ?
		String(run.findings.length) :
		'—';

	return `| ${OUTCOME_LABEL[outcome]} | \`${run.ruleId}\` | ${count} |`;
}

function byRuleId(a: RuleRun, b: RuleRun): number {
	return a.ruleId.localeCompare(b.ruleId);
}

function renderFinding(finding: Finding): string {
	const lines: string[] = [];

	lines.push(`### ${SEVERITY_LABEL[finding.severity]} — ${finding.title}`);
	lines.push(`\`${finding.ruleId}\` · ${subjectLabel(finding)}`);

	if (finding.detail) {
		lines.push(finding.detail);
	}
	if (finding.remediation) {
		lines.push(`**Remediation:** ${finding.remediation}`);
	}
	if (finding.references && finding.references.length > 0) {
		const refs = finding.references.map((ref) => `- [${ref.name}](${ref.url})`);

		lines.push([ '**References:**', ...refs ].join('\n'));
	}

	return lines.join('\n\n');
}

function bySeverityDesc(a: Finding, b: Finding): number {
	return compareSeverity(a.severity, b.severity);
}
