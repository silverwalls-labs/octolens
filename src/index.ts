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
	runRule,
	exitCodeFor,
	createLogger,
} from './engine/index.ts';

export type {
	LogLevel, ScanRepoOptions, ScanOrgOptions,
} from './engine/index.ts';
export type { ExitCodeOptions } from './engine/exit-code.ts';

export { createOctokit } from './github/client.ts';
export type { ClientOptions } from './github/client.ts';
export { resolveAuth, AuthError } from './github/auth.ts';
export type { AuthOptions, ResolvedAuth } from './github/auth.ts';
export { createCachedFetcher } from './github/fetcher.ts';

export {
	allRules, findRuleById, allOrgRules, findOrgRuleById,
} from './rules/index.ts';

export { formatJson, formatPretty } from './output/index.ts';
export type { PrettyOptions } from './output/index.ts';
