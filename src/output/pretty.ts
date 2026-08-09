import pc from 'picocolors';
import { compareSeverity } from '../types/severity.ts';
import type {
	Finding, RuleRun, ScanResult, Severity,
} from '../types/index.ts';

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
 * @param result - The scan result to format.
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

function isPass(run: RuleRun): boolean {
	return run.status === 'ok' && run.findings.length === 0;
}

function isFlagged(run: RuleRun): boolean {
	return run.status === 'ok' && run.findings.length > 0;
}

function bySeverityDesc(a: Finding, b: Finding): number {
	return compareSeverity(a.severity, b.severity);
}

function formatFinding(finding: Finding, colorize: (s: string) => string): string {
	const tag = colorize(SEVERITY_COLORS[finding.severity](`[${finding.severity.toUpperCase()}]`));
	const head = `${tag} ${colorize(pc.bold(finding.title))}`;
	const repoLabel = `${finding.repo.owner}/${finding.repo.name}`;
	const meta = colorize(pc.gray(`  ${finding.ruleId} - ${repoLabel}`));

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

function identity(s: string): string {
	return s;
}

const ANSI_RE = /\[[0-9;]*m/g;

function stripColor(s: string): string {
	return s.replace(ANSI_RE, '');
}
