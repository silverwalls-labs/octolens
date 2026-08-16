import pc from 'picocolors';
import { compareSeverity } from '../types/severity.ts';
import type {
	Finding, OrgScanReport, RuleRun, ScanResult, Severity,
} from '../types/index.ts';
import { subjectLabel } from './subject.ts';

const SEVERITY_COLORS: Record<Severity, (s: string) => string> = {
	critical: (s) => pc.bold(pc.red(s)),
	high: (s) => pc.red(s),
	medium: (s) => pc.yellow(s),
	low: (s) => pc.cyan(s),
	info: (s) => pc.gray(s),
};

/** Options for {@link formatPretty}. */
export type PrettyOptions = {
	/** Enable ANSI colors. Defaults to TTY detection on stdout. */
	color?: boolean;
};

/**
 * Format a scan result as a human-readable, optionally colorized string.
 *
 * Findings are sorted most-severe-first. The output includes a header,
 * individual findings with severity tags, and a summary section with
 * rule coverage and per-severity counts.
 *
 * @param result  - The scan result to format.
 * @param options - Formatting options.
 */
export function formatPretty(result: ScanResult, options: PrettyOptions = {}): string {
	const useColor = options.color ?? process.stdout.isTTY ?? false;
	const colorize = useColor ?
		identity :
		stripColor;

	const lines: string[] = [];

	const targetLabel = result.target.type === 'repo' ?
		`${result.target.owner}/${result.target.name}` :
		result.target.org;

	lines.push(colorize(pc.bold(`Octolens scan — ${targetLabel}`)));
	lines.push('');

	if (result.findings.length === 0) {
		lines.push(colorize(pc.green('  No findings at or above severity threshold.')));
	} else {
		const sorted = [ ...result.findings ].sort(bySeverityDesc);

		for (const finding of sorted) {
			lines.push(formatFinding(finding, colorize));
			lines.push('');
		}
	}

	const counts = result.summary.findingsBySeverity;
	const summaryParts = (Object.keys(counts) as Severity[])
		.filter((s) => counts[s] > 0)
		.map((s) => `${colorize(SEVERITY_COLORS[s](s))}: ${counts[s]}`);

	lines.push(colorize(pc.bold('Summary')));
	if (result.runs.length > 0) {
		lines.push(`  ${formatCoverage(result.runs, colorize)}`);
	}
	lines.push(`  Findings (>= ${result.threshold}): ${result.summary.findingsTotal}`);
	if (summaryParts.length > 0) {
		lines.push(`  ${summaryParts.join('  ')}`);
	}

	return `${lines.join('\n')}\n`;
}

/**
 * Format an organisation fleet report as a human-readable string.
 *
 * Shows the org-posture findings, a section per repository that has
 * findings (clean repositories are collapsed into a single count), failed
 * and skipped repositories, and an aggregate summary.
 *
 * @param report  - The fleet scan report to format.
 * @param options - Formatting options.
 */
export function formatPrettyReport(report: OrgScanReport, options: PrettyOptions = {}): string {
	const useColor = options.color ?? process.stdout.isTTY ?? false;
	const colorize = useColor ?
		identity :
		stripColor;

	const lines: string[] = [];
	const header = `Octolens scan — ${report.target.org} ` +
		`(organization + ${report.summary.reposScanned} repositories)`;

	lines.push(colorize(pc.bold(header)));
	lines.push('');

	lines.push(colorize(pc.bold('Organization posture')));
	pushFindings(lines, report.org.findings, colorize);
	lines.push('');

	const flagged = report.repos.filter((r) => r.findings.length > 0);
	const cleanCount = report.repos.length - flagged.length;

	lines.push(colorize(pc.bold(`Repositories (${report.summary.reposScanned} scanned)`)));
	for (const repo of flagged) {
		for (const finding of [ ...repo.findings ].sort(bySeverityDesc)) {
			lines.push(formatFinding(finding, colorize));
			lines.push('');
		}
	}
	if (cleanCount > 0) {
		lines.push(colorize(pc.green(`  ${cleanCount} repositories with no findings.`)));
	}
	if (report.repos.length === 0) {
		lines.push('  No repositories scanned.');
	}
	lines.push('');

	if (report.failures.length > 0) {
		lines.push(colorize(pc.bold(`Failed repositories (${report.failures.length})`)));
		for (const failure of report.failures) {
			const label = `${failure.repo.owner}/${failure.repo.name}`;

			lines.push(colorize(pc.yellow(`  ${label}: ${failure.error}`)));
		}
		lines.push('');
	}

	if (report.skipped.length > 0) {
		lines.push(colorize(pc.gray(`  Skipped: ${formatSkipCounts(report.skipped)}`)));
		lines.push('');
	}

	const counts = report.summary.findingsBySeverity;
	const summaryParts = (Object.keys(counts) as Severity[])
		.filter((s) => counts[s] > 0)
		.map((s) => `${colorize(SEVERITY_COLORS[s](s))}: ${counts[s]}`);
	const allRuns = [ report.org, ...report.repos ].flatMap((r) => r.runs);

	lines.push(colorize(pc.bold('Summary')));
	lines.push(`  Repositories: ${report.summary.reposScanned} scanned · ` +
		`${report.summary.reposSkipped} skipped · ${report.summary.reposFailed} failed`);
	if (!report.summary.listingComplete) {
		const warning = '  Repository listing incomplete — some repositories may be missing.';

		lines.push(colorize(pc.yellow(warning)));
	}
	if (allRuns.length > 0) {
		lines.push(`  ${formatCoverage(allRuns, colorize)}`);
	}
	lines.push(`  Findings (>= ${report.threshold}): ${report.summary.findingsTotal}`);
	if (summaryParts.length > 0) {
		lines.push(`  ${summaryParts.join('  ')}`);
	}

	return `${lines.join('\n')}\n`;
}

/**
 * Append rendered findings (sorted by severity) to the output lines.
 *
 * @param lines    - Output line accumulator (mutated in place).
 * @param findings - Findings to render.
 * @param colorize - Applied to highlight severity and metadata segments.
 */
function pushFindings(lines: string[], findings: Finding[], colorize: (s: string) => string): void {
	if (findings.length === 0) {
		lines.push(colorize(pc.green('  No findings at or above severity threshold.')));

		return;
	}

	for (const finding of [ ...findings ].sort(bySeverityDesc)) {
		lines.push(formatFinding(finding, colorize));
		lines.push('');
	}
}

/**
 * Summarise skip entries into per-reason counts.
 *
 * @param skipped - Skip entries from the fleet report.
 * @returns       The per-reason counts joined into one label.
 */
function formatSkipCounts(skipped: OrgScanReport['skipped']): string {
	const byReason = new Map<string, number>();

	for (const skip of skipped) {
		byReason.set(skip.reason, (byReason.get(skip.reason) ?? 0) + 1);
	}

	return [ ...byReason.entries() ]
		.map(([ reason, count ]) => `${count} ${reason}`)
		.join(' · ');
}

/**
 * Format the passed/flagged/skipped/errored counters for the summary line.
 *
 * @param runs     - Rule runs to aggregate.
 * @param colorize - Applied to highlight severity and metadata segments.
 * @returns        The formatted counter line.
 */
function formatCoverage(runs: RuleRun[], colorize: (s: string) => string): string {
	const passed = runs.filter(isPass).length;
	const flagged = runs.filter(isFlagged).length;
	const skipped = runs.filter((run) => run.status === 'skipped').length;
	const errored = runs.filter((run) => run.status === 'error').length;

	const erroredText = `${errored} errored`;
	const parts = [
		`${passed} passed`,
		`${flagged} flagged`,
		`${skipped} skipped`,
		errored > 0 ?
			colorize(pc.yellow(erroredText)) :
			erroredText,
	];

	return parts.join(' · ');
}

/**
 * Check whether a rule run completed with no findings.
 *
 * @param run - Rule run to inspect.
 * @returns   True for a clean pass.
 */
function isPass(run: RuleRun): boolean {
	return run.status === 'ok' && run.findings.length === 0;
}

/**
 * Check whether a rule run completed with findings.
 *
 * @param run - Rule run to inspect.
 * @returns   True when findings were produced.
 */
function isFlagged(run: RuleRun): boolean {
	return run.status === 'ok' && run.findings.length > 0;
}

/**
 * Comparator ordering findings from highest to lowest severity.
 *
 * @param a - First item to compare.
 * @param b - Second item to compare.
 * @returns Negative, zero, or positive per comparator contract.
 */
function bySeverityDesc(a: Finding, b: Finding): number {
	return compareSeverity(a.severity, b.severity);
}

/**
 * Render a single finding with severity colouring and metadata lines.
 *
 * @param finding  - Finding to render.
 * @param colorize - Applied to highlight severity and metadata segments.
 * @returns        The rendered finding block.
 */
function formatFinding(finding: Finding, colorize: (s: string) => string): string {
	const tag = colorize(SEVERITY_COLORS[finding.severity](`[${finding.severity.toUpperCase()}]`));
	const head = `${tag} ${colorize(pc.bold(finding.title))}`;
	const meta = colorize(pc.gray(`  ${finding.ruleId} - ${subjectLabel(finding)}`));

	const out = [ head, meta ];

	if (finding.detail) {
		out.push(`  ${finding.detail}`);
	}
	if (finding.remediation) {
		out.push(colorize(pc.gray(`  Remediation: ${finding.remediation}`)));
	}
	if (finding.references && finding.references.length > 0) {
		for (const ref of finding.references) {
			out.push(colorize(pc.gray(`    -> ${ref.name}: ${ref.url}`)));
		}
	}

	return out.join('\n');
}

/**
 * No-op colorizer used when colors are disabled.
 *
 * @param s - Input string.
 * @returns The input, unchanged.
 */
function identity(s: string): string {
	return s;
}

const ANSI_RE = /\[[0-9;]*m/g;

/**
 * Remove ANSI escape sequences from a string.
 *
 * @param s - Input string.
 * @returns The string without escape sequences.
 */
function stripColor(s: string): string {
	return s.replace(ANSI_RE, '');
}
