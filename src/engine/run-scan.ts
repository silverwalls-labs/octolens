import type { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../github/fetcher.ts';
import { ConfigError } from '../config/index.ts';
import { getRepoMetadata } from '../github/queries.ts';
import {
	isSeverity, meetsThreshold, SEVERITIES,
} from '../types/severity.ts';
import type {
	CachedFetcher,
	Finding,
	Logger,
	OctolensConfig,
	OrgRule,
	RepoRef,
	Rule,
	RuleConfigBag,
	ScanResult,
	ScanSummary,
	Severity,
} from '../types/index.ts';
import { runRule } from './run-rule.ts';

/** Options for {@link scanRepo}. */
export type ScanRepoOptions = {
	/** Target repository. */
	repo: RepoRef;

	/** Rules to evaluate. */
	rules: Rule[];

	/** Authenticated Octokit client. */
	octokit: Octokit;

	/** Logger instance. */
	logger: Logger;

	/** Only findings at or above this severity are included in the result. */
	threshold: Severity;

	/** User configuration (rule overrides, ignore filters). */
	config?: OctolensConfig;

	/** Arbitrary key-value bag forwarded into every rule's context. */
	ruleConfig?: RuleConfigBag;

	/** Query cache to use. Defaults to a fresh per-scan cache. */
	cache?: CachedFetcher;
};

/**
 * Run a full scan of a single repository against the provided rules.
 *
 * Rules disabled via `config.rules` are filtered out. Archived repos are
 * skipped by default (controlled by `config.ignore.archived`). Each rule
 * is executed sequentially; findings below the threshold are excluded
 * from the result.
 *
 * @param options - Scan configuration.
 * @returns       The complete scan result with findings, rule runs, and summary.
 */
export async function scanRepo(options: ScanRepoOptions): Promise<ScanResult> {
	const cache = options.cache ?? createCachedFetcher();
	const skipArchived = options.config?.ignore?.archived !== false;

	if (skipArchived) {
		try {
			const meta = await getRepoMetadata(options.octokit, cache, options.repo);

			if (meta.archived) {
				return buildArchivedSkipResult(options);
			}
		} catch {
			options.logger.warn('could not check archived status; proceeding with scan');
		}
	}

	const enabledRules = filterEnabledRules(options.rules, options.config);

	const runs = [];

	for (const rule of enabledRules) {
		options.logger.debug(`running rule ${rule.id}`);
		const run = await runRule(rule, {
			repo: options.repo,
			octokit: options.octokit,
			cache,
			logger: options.logger,
			ruleConfig: options.ruleConfig ?? {},
		});

		runs.push(run);
	}

	applyRunSeverityOverrides(runs, options.config);

	const allFindings = runs.flatMap((r) => r.findings);
	const findings = allFindings.filter((f) => meetsThreshold(f.severity, options.threshold));

	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: options.repo.owner, name: options.repo.name,
		},
		threshold: options.threshold,
		runs,
		findings,
		summary: buildSummary(runs, findings),
	};
}

/** Options for {@link scanOrg}. */
export type ScanOrgOptions = {
	/** Target organisation login. */
	org: string;

	/** Org-scoped rules to evaluate. */
	rules: OrgRule[];

	/** Authenticated Octokit client. */
	octokit: Octokit;

	/** Logger instance. */
	logger: Logger;

	/** Only findings at or above this severity are included in the result. */
	threshold: Severity;

	/** User configuration (rule overrides). */
	config?: OctolensConfig;

	/** Arbitrary key-value bag forwarded into every rule's context. */
	ruleConfig?: RuleConfigBag;

	/** Query cache to use. Defaults to a fresh per-scan cache. */
	cache?: CachedFetcher;
};

/**
 * Run a full scan of an organisation's own settings against the provided
 * org-scoped rules.
 *
 * Rules disabled via `config.rules` are filtered out. Each rule is executed
 * sequentially; findings below the threshold are excluded from the result.
 * Rules that cannot see admin-only settings (non-owner tokens) record a
 * `'skipped'` run rather than a false pass.
 *
 * @param options - Scan configuration.
 * @returns       The complete scan result with findings, rule runs, and summary.
 */
export async function scanOrg(options: ScanOrgOptions): Promise<ScanResult> {
	const cache = options.cache ?? createCachedFetcher();
	const enabledRules = filterEnabledRules(options.rules, options.config);

	const runs = [];

	for (const rule of enabledRules) {
		options.logger.debug(`running rule ${rule.id}`);
		const run = await runRule(rule, {
			org: options.org,
			octokit: options.octokit,
			cache,
			logger: options.logger,
			ruleConfig: options.ruleConfig ?? {},
		});

		runs.push(run);
	}

	applyRunSeverityOverrides(runs, options.config);

	const allFindings = runs.flatMap((r) => r.findings);
	const findings = allFindings.filter((f) => meetsThreshold(f.severity, options.threshold));

	return {
		schemaVersion: 1,
		target: { type: 'org', org: options.org },
		threshold: options.threshold,
		runs,
		findings,
		summary: buildSummary(runs, findings),
	};
}

/**
 * Build the empty all-skipped result reported for archived repositories.
 *
 * @param options - Scan options for the archived repository.
 * @returns       A result with every rule counted as skipped.
 */
function buildArchivedSkipResult(options: ScanRepoOptions): ScanResult {
	const { owner, name } = options.repo;

	options.logger.info(`skipping archived repository ${owner}/${name}`);

	return {
		schemaVersion: 1,
		target: {
			type: 'repo', owner: options.repo.owner, name: options.repo.name,
		},
		threshold: options.threshold,
		runs: [],
		findings: [],
		summary: {
			rulesRun: 0,
			rulesErrored: 0,
			rulesSkipped: options.rules.length,
			findingsTotal: 0,
			findingsBySeverity: {
				critical: 0,
				high: 0,
				medium: 0,
				low: 0,
				info: 0,
			},
		},
	};
}

/**
 * Drop rules disabled via the configuration's rule overrides.
 *
 * @param    rules  - Rules to filter.
 * @param    config - Optional scan configuration.
 * @returns         Rules that remain enabled.
 * @template R      - Rule shape carrying an `id`.
 */
function filterEnabledRules<R extends { id: string; }>(rules: R[], config?: OctolensConfig): R[] {
	const overrides = config?.rules ?? {};

	return rules.filter((r) => overrides[r.id] !== 'off');
}

/**
 * Replace finding severities where the config specifies an override.
 *
 * Rules disabled via `'off'` are already filtered out by
 * {@link filterEnabledRules}, so only concrete severity values are applied
 * here. Findings whose rule has no override pass through unchanged.
 *
 * @param findings  - Findings to process.
 * @param overrides - Validated per-rule severity overrides.
 * @returns         A new array with overridden severities where applicable.
 */
function applySeverityOverrides(
	findings: Finding[],
	overrides: Record<string, Severity>,
): Finding[] {
	return findings.map((f) => {
		const override = overrides[f.ruleId];

		return override === undefined ?
			f :
			{ ...f, severity: override };
	});
}

/**
 * Apply severity overrides to every run's findings in place so that
 * `runs[].findings` and the top-level `findings` array stay consistent.
 *
 * Overrides are validated before use, per the project's fail-loud config
 * policy: a value that is neither `'off'` nor a known severity (possible
 * when a library caller builds the config object directly, bypassing
 * {@link loadConfig}) throws instead of corrupting findings downstream.
 *
 * @param  runs   - Rule runs whose findings should be updated.
 * @param  config - Optional scan configuration.
 * @throws {ConfigError} If a rule override is not a severity or `'off'`.
 */
function applyRunSeverityOverrides(
	runs: { findings: Finding[]; }[],
	config: OctolensConfig | undefined,
): void {
	const entries = Object.entries(config?.rules ?? {});

	if (entries.length === 0) {
		return;
	}

	const overrides: Record<string, Severity> = {};

	for (const [ id, setting ] of entries) {
		if (isSeverity(setting)) {
			overrides[id] = setting;
		} else if (setting !== 'off') {
			throw new ConfigError(`rules.${id}: severity override must be one of ` +
				`${SEVERITIES.join(' | ')} | off, got ${JSON.stringify(setting)}`);
		}
	}

	for (const run of runs) {
		run.findings = applySeverityOverrides(run.findings, overrides);
	}
}

/**
 * Aggregate run statuses and findings into a {@link ScanSummary}.
 *
 * @param runs     - Rule runs to aggregate.
 * @param findings - Findings produced by the runs.
 * @returns        The aggregated scan summary.
 */
function buildSummary(runs: { status: string; }[], findings: Finding[]): ScanSummary {
	const findingsBySeverity: ScanSummary['findingsBySeverity'] = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const f of findings) {
		findingsBySeverity[f.severity]++;
	}

	return {
		rulesRun: runs.length,
		rulesErrored: runs.filter((r) => r.status === 'error').length,
		rulesSkipped: runs.filter((r) => r.status === 'skipped').length,
		findingsTotal: findings.length,
		findingsBySeverity,
	};
}
