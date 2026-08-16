import type { Octokit } from '@octokit/rest';
import { createCachedFetcher, createScopedCache } from '../github/fetcher.ts';
import {
	getOrgMetadata,
	listOrgRepos,
	ORG_SCOPED_CACHE_PREFIXES,
	type OrgRepoListing,
} from '../github/queries.ts';
import { createRateBudget } from '../github/budget.ts';
import type {
	FailedRepo,
	FleetSummary,
	Logger,
	OctolensConfig,
	OrgRule,
	OrgScanReport,
	RepoSkipReason,
	Rule,
	RuleConfigBag,
	ScanResult,
	SkippedRepo,
	Severity,
} from '../types/index.ts';
import { runPool } from './pool.ts';
import { scanOrg, scanRepo } from './run-scan.ts';

/** Default number of repositories scanned concurrently. */
const DEFAULT_CONCURRENCY = 4;

/** Approximate API request cost of one full repository scan, with margin. */
const REQUESTS_PER_REPO = 35;

/** Options for {@link scanOrgAllRepos}. */
export type ScanOrgAllReposOptions = {
	/** Target organisation login. */
	org: string;

	/** Org-scoped rules for the posture scan. */
	orgRules: OrgRule[];

	/** Repo-scoped rules applied to every repository. */
	repoRules: Rule[];

	/** Authenticated Octokit client. */
	octokit: Octokit;

	/** Logger instance (progress is reported at `info` level). */
	logger: Logger;

	/** Only findings at or above this severity are included in the results. */
	threshold: Severity;

	/** User configuration (rule overrides, ignore filters, org settings). */
	config?: OctolensConfig;

	/** Arbitrary key-value bag forwarded into every rule's context. */
	ruleConfig?: RuleConfigBag;

	/** Repositories scanned concurrently. Overrides `config.org.concurrency`. */
	concurrency?: number;

	/** Rate budget kept in reserve. Defaults to `max(50, concurrency × 35)`. */
	reserve?: number;

	/** Clock in epoch milliseconds. Test injection. */
	now?: () => number;

	/** Sleep implementation for rate-budget pauses. Test injection. */
	sleep?: (ms: number) => Promise<void>;
};

/**
 * Scan an organisation's own settings and every one of its repositories.
 *
 * The repository listing is streamed so scanning starts before it
 * completes. Repositories are filtered before any per-repo API spend
 * (archived / fork / ignore list, straight from the listing payload), then
 * scanned by a bounded worker pool paced by a proactive rate budget: when
 * the remaining primary rate limit drops below a reserve, intake pauses
 * until the window resets, so large organisations complete without
 * failures instead of exhausting the limit.
 *
 * A repository whose scan fails entirely is recorded in `failures` and
 * never aborts the run. A listing error truncates the run
 * (`summary.listingComplete: false`) but still returns everything gathered.
 *
 * @param options - Fleet scan configuration.
 * @returns The aggregate report: org result, per-repo results, skips, failures.
 */
export async function scanOrgAllRepos(options: ScanOrgAllReposOptions): Promise<OrgScanReport> {
	const now = options.now ?? Date.now;
	const startedAt = now();
	const concurrency = resolveConcurrency(options);
	const parentCache = createCachedFetcher();

	const orgResult = await scanOrg({
		org: options.org,
		rules: options.orgRules,
		octokit: options.octokit,
		logger: options.logger,
		threshold: options.threshold,
		config: options.config,
		ruleConfig: options.ruleConfig,
		cache: parentCache,
	});

	const expected = await expectedRepoCount(options, parentCache);

	if (expected !== null) {
		options.logger.info(`expecting ~${expected} repositories in ${options.org}`);
	}

	const budget = createRateBudget({
		octokit: options.octokit,
		reserve: options.reserve ?? Math.max(50, concurrency * REQUESTS_PER_REPO),
		logger: options.logger,
		now: options.now,
		sleep: options.sleep,
	});

	const skipped: SkippedRepo[] = [];
	const failures: FailedRepo[] = [];
	const repoResults: ScanResult[] = [];
	let discovered = 0;
	let listingComplete = false;
	let scanned = 0;

	async function *eligibleRepos(): AsyncGenerator<OrgRepoListing> {
		try {
			for await (const entry of listOrgRepos(options.octokit, options.org)) {
				discovered++;
				const reason = repoFilterReason(entry, options.config);

				if (reason) {
					skipped.push({ repo: { owner: entry.owner, name: entry.name }, reason });
					options.logger.debug(`skipping ${entry.owner}/${entry.name} (${reason})`);
					continue;
				}
				yield entry;
			}
			listingComplete = true;
		} catch (err: unknown) {
			const message = `repository listing failed after ${discovered} ` +
				`repositories: ${errorMessage(err)}; ` +
				'continuing with the repositories gathered so far';

			options.logger.warn(message);
		}
	}

	async function scanOneRepo(entry: OrgRepoListing): Promise<void> {
		const repo = { owner: entry.owner, name: entry.name };

		try {
			await budget.acquire();
			const result = await scanRepo({
				repo,
				rules: options.repoRules,
				octokit: options.octokit,
				logger: options.logger,
				threshold: options.threshold,
				config: options.config,
				ruleConfig: options.ruleConfig,
				cache: createScopedCache(parentCache, ORG_SCOPED_CACHE_PREFIXES),
			});

			repoResults.push(result);
			scanned++;
			options.logger.info(progressLine(repo, result, scanned, expected, budget.snapshot()));
		} catch (err: unknown) {
			failures.push({ repo, error: errorMessage(err) });
			options.logger.warn(`scan of ${repo.owner}/${repo.name} failed: ${errorMessage(err)}`);
		}
	}

	try {
		await runPool(eligibleRepos(), scanOneRepo, concurrency);
	} finally {
		budget.dispose();
	}

	repoResults.sort(byRepoTarget);
	skipped.sort(byRepoRef);
	failures.sort(byRepoRef);

	const summary = buildFleetSummary(orgResult, repoResults, {
		discovered, skipped: skipped.length, failed: failures.length, listingComplete,
	});

	options.logger.info(`fleet scan complete: ${summary.reposScanned} scanned, ` +
		`${summary.reposSkipped} skipped, ${summary.reposFailed} failed ` +
		`in ${formatElapsed(now() - startedAt)}`);

	return {
		schemaVersion: 1,
		target: { type: 'org-fleet', org: options.org },
		threshold: options.threshold,
		org: orgResult,
		repos: repoResults,
		skipped,
		failures,
		summary,
	};
}

/**
 * Decide whether a listed repository is excluded from the fan-out.
 *
 * Uses only fields present in the listing payload, so a skipped repository
 * costs zero additional API requests.
 *
 * @param entry - Repository entry from the org listing.
 * @param config - User configuration with `ignore` filters.
 * @returns The skip reason, or `null` when the repository should be scanned.
 */
export function repoFilterReason(
	entry: OrgRepoListing,
	config?: OctolensConfig,
): RepoSkipReason | null {
	if (entry.archived && config?.ignore?.archived !== false) {
		return 'archived';
	}

	if (entry.fork && config?.ignore?.forks === true) {
		return 'fork';
	}

	const ignoreList = config?.ignore?.repos ?? [];
	const fullName = `${entry.owner}/${entry.name}`.toLowerCase();

	if (ignoreList.some((ignored) => ignored.toLowerCase() === fullName)) {
		return 'ignored';
	}

	return null;
}

function resolveConcurrency(options: ScanOrgAllReposOptions): number {
	const requested = options.concurrency ??
		options.config?.org?.concurrency ??
		DEFAULT_CONCURRENCY;

	return Math.max(1, Math.floor(requested));
}

async function expectedRepoCount(
	options: ScanOrgAllReposOptions,
	cache: ReturnType<typeof createCachedFetcher>,
): Promise<number | null> {
	try {
		// Already cached when any org-posture rule ran; at most one request.
		const meta = await getOrgMetadata(options.octokit, cache, options.org);

		if (meta.publicRepos === null && meta.totalPrivateRepos === null) {
			return null;
		}

		return (meta.publicRepos ?? 0) + (meta.totalPrivateRepos ?? 0);
	} catch {
		return null;
	}
}

function progressLine(
	repo: { owner: string; name: string; },
	result: ScanResult,
	scanned: number,
	expected: number | null,
	budget: { remaining: number | null; },
): string {
	const position = expected !== null ?
		`[${scanned}/~${expected}]` :
		`[${scanned}]`;
	const rate = budget.remaining !== null ?
		` (rate budget: ${budget.remaining} remaining)` :
		'';

	return `${position} scanned ${repo.owner}/${repo.name} — ` +
		`${result.summary.findingsTotal} finding(s)${rate}`;
}

function buildFleetSummary(
	orgResult: ScanResult,
	repoResults: ScanResult[],
	counts: {
		discovered: number; skipped: number; failed: number; listingComplete: boolean;
	},
): FleetSummary {
	const summaries = [ orgResult.summary, ...repoResults.map((r) => r.summary) ];

	const findingsBySeverity: FleetSummary['findingsBySeverity'] = {
		critical: 0,
		high: 0,
		medium: 0,
		low: 0,
		info: 0,
	};

	for (const summary of summaries) {
		for (const severity of Object.keys(findingsBySeverity) as Severity[]) {
			findingsBySeverity[severity] += summary.findingsBySeverity[severity];
		}
	}

	return {
		reposDiscovered: counts.discovered,
		reposScanned: repoResults.length,
		reposSkipped: counts.skipped,
		reposFailed: counts.failed,
		listingComplete: counts.listingComplete,
		rulesRun: sumOf(summaries, (s) => s.rulesRun),
		rulesErrored: sumOf(summaries, (s) => s.rulesErrored),
		rulesSkipped: sumOf(summaries, (s) => s.rulesSkipped),
		findingsTotal: sumOf(summaries, (s) => s.findingsTotal),
		findingsBySeverity,
	};
}

function sumOf<T>(items: T[], pick: (item: T) => number): number {
	return items.reduce((total, item) => total + pick(item), 0);
}

function byRepoTarget(a: ScanResult, b: ScanResult): number {
	return targetLabel(a).localeCompare(targetLabel(b));
}

function targetLabel(result: ScanResult): string {
	return result.target.type === 'repo' ?
		`${result.target.owner}/${result.target.name}` :
		result.target.org;
}

type RepoEntry = { repo: { owner: string; name: string; }; };

function byRepoRef(a: RepoEntry, b: RepoEntry): number {
	return `${a.repo.owner}/${a.repo.name}`.localeCompare(`${b.repo.owner}/${b.repo.name}`);
}

function errorMessage(err: unknown): string {
	return err instanceof Error ?
		err.message :
		String(err);
}

function formatElapsed(ms: number): string {
	const totalSeconds = Math.round(ms / 1000);
	const minutes = Math.floor(totalSeconds / 60);
	const seconds = totalSeconds % 60;

	return minutes > 0 ?
		`${minutes}m ${seconds}s` :
		`${seconds}s`;
}
