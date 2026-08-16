import { compareSeverity, SEVERITIES } from '../types/severity.ts';
import type {
	Finding, OrgScanReport, RuleRun, ScanResult, Severity,
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

/**
 * Render an organisation fleet report as a Markdown document.
 *
 * Includes the fleet summary, the org-posture findings, a subsection per
 * repository with findings (clean repositories are collapsed into a count),
 * and tables for failed and skipped repositories.
 *
 * @param report - The fleet scan report to format.
 * @returns A complete Markdown document with a trailing newline.
 */
export function formatMarkdownReport(report: OrgScanReport): string {
	const sections: string[] = [];

	sections.push(`# Octolens scan — ${report.target.org} (organization fleet)`);
	sections.push(renderFleetSummary(report));

	sections.push('## Organization posture');
	if (report.org.findings.length === 0) {
		sections.push(`No findings at or above the \`${report.threshold}\` threshold.`);
	} else {
		for (const finding of [ ...report.org.findings ].sort(bySeverityDesc)) {
			sections.push(renderFinding(finding));
		}
	}

	const flagged = report.repos.filter((r) => r.findings.length > 0);
	const cleanCount = report.repos.length - flagged.length;
	const repoHeading = `## Repositories (${report.summary.reposScanned} scanned, ` +
		`${report.summary.reposSkipped} skipped, ${report.summary.reposFailed} failed)`;

	sections.push(repoHeading);
	for (const repo of flagged) {
		for (const finding of [ ...repo.findings ].sort(bySeverityDesc)) {
			sections.push(renderFinding(finding));
		}
	}
	if (cleanCount > 0) {
		sections.push(`${cleanCount} repositories with no findings.`);
	}
	if (report.repos.length === 0) {
		sections.push('No repositories scanned.');
	}

	if (report.failures.length > 0) {
		sections.push(renderFailures(report));
	}

	if (report.skipped.length > 0) {
		sections.push(renderSkipped(report));
	}

	return `${sections.join('\n\n')}\n`;
}

function renderFleetSummary(report: OrgScanReport): string {
	const counts = report.summary.findingsBySeverity;
	const rows = SEVERITIES.map((s) => `| ${SEVERITY_LABEL[s]} | ${counts[s]} |`);
	const listingNote = report.summary.listingComplete ?
		'' :
		'\n\n> ⚠️ Repository listing incomplete — some repositories may be missing.';

	return [
		`Threshold: \`${report.threshold}\` — ${report.summary.rulesRun} rules run across ` +
		`the organization and ${report.summary.reposScanned} repositories, ` +
		`${report.summary.findingsTotal} finding(s).${listingNote}`,
		'',
		'| Severity | Count |',
		'| --- | --- |',
		...rows,
	].join('\n');
}

function renderFailures(report: OrgScanReport): string {
	const rows = report.failures.map((f) => `| \`${f.repo.owner}/${f.repo.name}\` | ${f.error} |`);

	return [
		`## Failed repositories (${report.failures.length})`,
		'',
		'| Repository | Error |',
		'| --- | --- |',
		...rows,
	].join('\n');
}

function renderSkipped(report: OrgScanReport): string {
	const rows = report.skipped.map((s) => `| \`${s.repo.owner}/${s.repo.name}\` | ${s.reason} |`);

	return [
		`## Skipped repositories (${report.skipped.length})`,
		'',
		'| Repository | Reason |',
		'| --- | --- |',
		...rows,
	].join('\n');
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
