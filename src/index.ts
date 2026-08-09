export type {
	Severity,
	Finding,
	RepoRef,
	Reference,
	Rule,
	RuleCategory,
	RuleContext,
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
} from './types/index.ts';

export {
	scanRepo,
	runRule,
	exitCodeFor,
	createLogger,
} from './engine/index.ts';

export type { LogLevel, ScanRepoOptions } from './engine/index.ts';

export { createOctokit } from './github/client.ts';
export { resolveAuth, AuthError } from './github/auth.ts';
export { createCachedFetcher } from './github/fetcher.ts';

export { allRules, findRuleById } from './rules/index.ts';

export { formatJson, formatPretty } from './output/index.ts';
