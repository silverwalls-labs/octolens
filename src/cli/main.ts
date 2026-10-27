import { writeFileSync } from 'node:fs';
import { resolveAuth, AuthError } from '../github/auth.ts';
import { createOctokit } from '../github/client.ts';
import {
	createLogger, scanRepo, scanOrg, scanOrgAllRepos, exitCodeFor, exitCodeForReport,
	filterRulesByGlob, unmatchedPatterns, diffFindings, filterScanResult, filterOrgScanReport,
} from '../engine/index.ts';
import {
	loadBaseline, assertBaselineCompatible, BaselineError,
} from '../engine/index.ts';
import type { Baseline, BaselineTargetType } from '../engine/index.ts';
import { allRules, allOrgRules } from '../rules/index.ts';
import type { OrgRule, Rule } from '../types/index.ts';
import {
	formatJson, formatMarkdown, formatMarkdownReport, formatPretty, formatPrettyReport, formatSarif,
} from '../output/index.ts';
import { loadConfig, ConfigError } from '../config/index.ts';
import type {
	OctolensConfig, OrgScanReport, ScanResult,
} from '../types/index.ts';
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
	// Fleet scans and baseline diffs surface progress by default.
	const logger = createLogger(args.verbose ?
		'debug' :
		args.allRepos || args.baseline !== undefined ?
			'info' :
			'warn');

	let loaded;

	try {
		loaded = loadConfig();
	} catch (err) {
		// loadConfig only throws ConfigError; the guard is defensive.
		if (!(err instanceof ConfigError)) throw err;

		process.stderr.write(`${err.message}\n`);

		return 2;
	}
	logger.debug(loaded.sources.length > 0 ?
		`config loaded from ${loaded.sources.join(', ')}` :
		'no config file found');

	const config = applyCliOverrides(loaded.config, args);

	const unknown = unknownRuleIds(config);

	if (unknown.length > 0) {
		const sources = loaded.sources.join(', ');
		const ids = unknown.join(', ');
		const message = `unknown rule ID(s) in config "rules" (${sources}): ${ids}\n`;

		process.stderr.write(message);

		return 2;
	}

	const globPatterns = { only: args.onlyRules, skip: args.skipRules };
	const hasGlobs = args.onlyRules.length > 0 || args.skipRules.length > 0;

	/*
	 * Determine which rule sets are relevant for the scan mode:
	 * --repo → repo rules only, --org → org rules only,
	 * --org --all-repos → both.
	 */
	const useRepoRules = args.repo !== undefined || args.allRepos;
	const useOrgRules = args.org !== undefined;

	if (hasGlobs) {
		const relevant = useRepoRules && useOrgRules ?
			[ ...allRules, ...allOrgRules ] :
			useRepoRules ?
				[ ...allRules ] :
				[ ...allOrgRules ];
		const relevantIds = relevant.map((r) => r.id);

		const bad = [
			...unmatchedPatterns(relevantIds, args.onlyRules),
			...unmatchedPatterns(relevantIds, args.skipRules),
		];

		if (bad.length > 0) {
			process.stderr.write(`glob pattern(s) matched no known rule ID: ${bad.join(', ')}\n`);

			return 2;
		}
	}

	const filteredRules: Rule[] = useRepoRules ?
		filterRulesByGlob(allRules, globPatterns) :
		[];
	const filteredOrgRules: OrgRule[] = useOrgRules ?
		filterRulesByGlob(allOrgRules, globPatterns) :
		[];

	if (hasGlobs && filteredRules.length === 0 && filteredOrgRules.length === 0) {
		process.stderr.write('no rules remain after --only-rules / --skip-rules filtering\n');

		return 2;
	}

	/*
	 * Load and validate the baseline early so a bad file is caught before
	 * spending API calls on the scan.
	 */
	let baseline: Baseline | undefined;

	if (args.baseline !== undefined) {
		const expectedType: BaselineTargetType = args.org !== undefined && args.allRepos ?
			'org-fleet' :
			args.org !== undefined ?
				'org' :
				'repo';

		try {
			baseline = loadBaseline(args.baseline);
			assertBaselineCompatible(baseline, expectedType);
		} catch (err) {
			if (!(err instanceof BaselineError)) throw err;

			process.stderr.write(`${err.message}\n`);

			return 2;
		}

		logger.debug(`baseline loaded from ${args.baseline}` +
			` (${baseline.findings.length} findings)`);
	}

	/*
	 * A fleet scan fans out over every repository even when no repo rule
	 * survives the filters, and still evaluates org rules when none survive.
	 * Both are legal but surprising, so surface them instead of reporting
	 * silently empty rule runs.
	 */
	if (args.org !== undefined && args.allRepos && hasGlobs) {
		if (filteredRules.length === 0) {
			logger.warn('glob filtering left no repo rules; ' +
				'repositories will be scanned without rules');
		}
		if (filteredOrgRules.length === 0) {
			logger.warn('glob filtering left no org rules; ' +
				'organization settings will not be checked');
		}
	}

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
			orgRules: [ ...filteredOrgRules ],
			repoRules: [ ...filteredRules ],
			octokit,
			logger,
			threshold: args.severity,
			config,
			ruleConfig,
			concurrency: args.concurrency,
		});

		if (baseline !== undefined) {
			const allFindings = [ ...report.org.findings ];

			for (const repo of report.repos) {
				allFindings.push(...repo.findings);
			}
			const { added, summary: diff } = diffFindings(baseline.findings, allFindings);

			logger.info(`baseline: ${diff.added} new, ` +
				`${diff.removed} resolved, ` +
				`${diff.unchanged} unchanged`);

			const filtered = filterOrgScanReport(report, added);

			emitOutput(filtered, args.formats, args.out);

			if (args.failOnSkip && exitCodeForReport(filtered, { failOnIncomplete: true }) === 1) {
				return 1;
			}

			return added.length > 0 ?
				1 :
				0;
		}

		emitOutput(report, args.formats, args.out);

		return exitCodeForReport(report, { failOnIncomplete: args.failOnSkip });
	}

	const result = args.org !== undefined ?
		await scanOrg({
			org: args.org,
			rules: [ ...filteredOrgRules ],
			octokit,
			logger,
			threshold: args.severity,
			config,
		}) :
		await scanRepo({
			// parseArgs guarantees exactly one of repo/org is set.
			repo: args.repo as { owner: string; name: string; },
			rules: [ ...filteredRules ],
			octokit,
			logger,
			threshold: args.severity,
			config,
			ruleConfig,
		});

	if (baseline !== undefined) {
		const { added, summary: diff } = diffFindings(baseline.findings, result.findings);

		const msg = `baseline: ${diff.added} new, ` +
			`${diff.removed} resolved, ${diff.unchanged} unchanged`;

		logger.info(msg);

		const filtered = filterScanResult(result, added);

		emitOutput(filtered, args.formats, args.out);

		if (args.failOnSkip && exitCodeFor(filtered, { failOnIncomplete: true }) === 1) {
			return 1;
		}

		return added.length > 0 ?
			1 :
			0;
	}

	emitOutput(result, args.formats, args.out);

	return exitCodeFor(result, { failOnIncomplete: args.failOnSkip });
}

/**
 * Collect rule IDs from the config that match no built-in rule.
 *
 * The config loader validates override values but cannot validate rule
 * IDs, since it does not know the rule universe. Per the project's
 * fail-loud config policy, the CLI aborts rather than silently ignoring
 * a typo'd ID: a rule the user believes is disabled or remapped must not
 * quietly keep its built-in severity.
 *
 * @param config - Configuration loaded from disk.
 * @returns      The config rule IDs that match no known rule.
 */
function unknownRuleIds(config: OctolensConfig): string[] {
	if (config.rules === undefined) {
		return [];
	}

	const knownIds = [ ...allRules, ...allOrgRules ].map((rule) => rule.id);
	const known = new Set(knownIds);

	return Object.keys(config.rules).filter((id) => !known.has(id));
}

/**
 * Layer explicitly typed CLI flags over the file configuration.
 *
 * Flags the user did not type leave file values (and built-in defaults)
 * untouched: `--include-archived` is only present when typed, and
 * `--concurrency` is forwarded separately and already beats
 * `config.org.concurrency` downstream.
 *
 * @param config - Configuration loaded from disk.
 * @param args   - Parsed scan command arguments.
 * @returns      The configuration with CLI overrides applied.
 */
function applyCliOverrides(config: OctolensConfig, args: ScanCommandArgs): OctolensConfig {
	if (!args.includeArchived) {
		return config;
	}

	return { ...config, ignore: { ...config.ignore, archived: false } };
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
	if (format === 'sarif') {
		return formatSarif(result);
	}
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
