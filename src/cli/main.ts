import { writeFileSync } from 'node:fs';
import { resolveAuth, AuthError } from '../github/auth.ts';
import { createOctokit } from '../github/client.ts';
import {
	createLogger, scanRepo, scanOrg, scanOrgAllRepos, exitCodeFor, exitCodeForReport,
} from '../engine/index.ts';
import { allRules, allOrgRules } from '../rules/index.ts';
import {
	formatJson, formatMarkdown, formatMarkdownReport, formatPretty, formatPrettyReport,
} from '../output/index.ts';
import type { OrgScanReport, ScanResult } from '../types/index.ts';
import {
	parseArgs, CliUsageError, type Format, type ScanCommandArgs,
} from './parse-args.ts';
import { HELP_TEXT } from './help.ts';
import { readVersion } from './version.ts';

/**
 * CLI entry point.
 *
 * Parses `argv`, dispatches to the appropriate command (help, version,
 * or scan), and returns the exit code.
 *
 * @param argv - Raw command-line arguments (without `node` and script path).
 * @returns    Exit code: `0` on success, `1` on findings, `2` on usage error.
 */
export async function main(argv: string[]): Promise<number> {
	let parsed;

	try {
		parsed = parseArgs(argv);
	} catch (err) {
		if (err instanceof CliUsageError) {
			process.stderr.write(`${err.message}\n\n${HELP_TEXT}`);

			return 2;
		}
		throw err;
	}

	if (parsed.command === 'help') {
		process.stdout.write(HELP_TEXT);

		return 0;
	}

	if (parsed.command === 'version') {
		process.stdout.write(`${readVersion()}\n`);

		return 0;
	}

	return runScanCommand(parsed);
}

/**
 * Run the scan command end to end and map the outcome to an exit code.
 *
 * @param args - Parsed scan command arguments.
 * @returns    Process exit code for the scan.
 */
async function runScanCommand(args: ScanCommandArgs): Promise<number> {
	// Fleet scans can run for a long time; surface progress by default.
	const logger = createLogger(args.verbose ?
		'debug' :
		args.allRepos ?
			'info' :
			'warn');

	let auth;

	try {
		auth = resolveAuth({ token: args.token });
	} catch (err) {
		// resolveAuth only throws AuthError; the guard is defensive.
		if (!(err instanceof AuthError)) throw err;

		process.stderr.write(`${err.message}\n`);

		return 2;
	}
	logger.debug(`auth source: ${auth.source}`);

	const octokit = createOctokit({
		token: auth.token,
		userAgent: `octolens/${readVersion()}`,
		logger,
	});

	const ruleConfig = {
		'access/visibility-private-default': {
			allowPublic: args.allowPublic,
			allowInternal: args.allowInternal,
		},
	};

	if (args.org !== undefined && args.allRepos) {
		const report = await scanOrgAllRepos({
			org: args.org,
			orgRules: [ ...allOrgRules ],
			repoRules: [ ...allRules ],
			octokit,
			logger,
			threshold: args.severity,
			config: { ignore: { archived: !args.includeArchived } },
			ruleConfig,
			concurrency: args.concurrency,
		});

		emitOutput(report, args.formats, args.out);

		return exitCodeForReport(report, { failOnIncomplete: args.failOnSkip });
	}

	const result = args.org !== undefined ?
		await scanOrg({
			org: args.org,
			rules: [ ...allOrgRules ],
			octokit,
			logger,
			threshold: args.severity,
		}) :
		await scanRepo({
			// parseArgs guarantees exactly one of repo/org is set.
			repo: args.repo as { owner: string; name: string; },
			rules: [ ...allRules ],
			octokit,
			logger,
			threshold: args.severity,
			config: { ignore: { archived: !args.includeArchived } },
			ruleConfig,
		});

	emitOutput(result, args.formats, args.out);

	return exitCodeFor(result, { failOnIncomplete: args.failOnSkip });
}

/**
 * Render the result in every requested format. The last format goes to the
 * output file when `--out` is set; everything else goes to stdout.
 *
 * @param result  - Scan result to inspect.
 * @param formats - Formats to render, in order.
 * @param out     - Optional output file path.
 */
function emitOutput(
	result: ScanResult | OrgScanReport,
	formats: Format[],
	out: string | undefined,
): void {
	for (const format of formats) {
		const rendered = render(result, format);

		if (out && format === formats[formats.length - 1]) {
			writeFileSync(out, rendered);
		} else {
			process.stdout.write(rendered);
		}
	}
}

/**
 * Render a scan result or fleet report in the given format.
 *
 * @param result - Scan result to inspect.
 * @param format - Output format to use.
 * @returns      The rendered document.
 */
function render(result: ScanResult | OrgScanReport, format: Format): string {
	if (isFleetReport(result)) {
		switch (format) {
			case 'json':
				return formatJson(result);
			case 'md':
				return formatMarkdownReport(result);
			default:
				return formatPrettyReport(result);
		}
	}

	switch (format) {
		case 'json':
			return formatJson(result);
		case 'md':
			return formatMarkdown(result);
		default:
			return formatPretty(result);
	}
}

/**
 * Narrow a scan outcome to the fleet report variant.
 *
 * @param result - Scan result to inspect.
 * @returns      True when the result is a fleet report.
 */
function isFleetReport(result: ScanResult | OrgScanReport): result is OrgScanReport {
	return result.target.type === 'org-fleet';
}
