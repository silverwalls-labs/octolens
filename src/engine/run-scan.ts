import type { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../github/fetcher.ts';
import { getRepoMetadata } from '../github/queries.ts';
import { meetsThreshold } from '../types/severity.ts';
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
