export type {
	Severity,
	Finding,
	RepoRef,
	Reference,
	Rule,
	RuleCategory,
	RuleContext,
	RuleConfigBag,
	RuleMetadata,
	OrgRule,
	OrgRuleContext,
	CachedFetcher,
	Logger,
	OctolensConfig,
	RuleSetting,
	ScanResult,
	ScanSummary,
	RuleRun,
	RuleRunStatus,
	OrgScanReport,
	FleetSummary,
	SkippedRepo,
	FailedRepo,
	RepoSkipReason,
} from './types/index.ts';

export {
	SEVERITIES,
	isSeverity,
	compareSeverity,
	meetsThreshold,
	RuleSkipped,
	skip,
} from './types/index.ts';

export {
	scanRepo,
	scanOrg,
	scanOrgAllRepos,
	repoFilterReason,
	runRule,
	exitCodeFor,
	exitCodeForReport,
	createLogger,
} from './engine/index.ts';

export type {
	LogLevel, ScanRepoOptions, ScanOrgOptions, ScanOrgAllReposOptions,
} from './engine/index.ts';
export type { ExitCodeOptions } from './engine/exit-code.ts';

export { createOctokit } from './github/client.ts';
export type { ClientOptions } from './github/client.ts';
export type { OrgRepoListing, RepoVisibility } from './github/queries.ts';
export { resolveAuth, AuthError } from './github/auth.ts';
export type { AuthOptions, ResolvedAuth } from './github/auth.ts';
export { createCachedFetcher, createScopedCache } from './github/fetcher.ts';
export { createRateBudget } from './github/budget.ts';
export type {
	RateBudget, RateBudgetOptions, RateBudgetSnapshot,
} from './github/budget.ts';

export {
	allRules, findRuleById, allOrgRules, findOrgRuleById,
} from './rules/index.ts';

export {
	formatJson, formatPretty, formatPrettyReport, formatMarkdown, formatMarkdownReport,
} from './output/index.ts';
export type { PrettyOptions } from './output/index.ts';
