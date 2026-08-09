import type { Octokit } from '@octokit/rest';
import type { Finding, RepoRef } from './finding.ts';
import type { Severity } from './severity.ts';

export type RuleCategory = 'repo-config' | 'security' | 'access' | 'cicd';

export type Logger = {
	debug(message: string, data?: unknown): void;
	info(message: string, data?: unknown): void;
	warn(message: string, data?: unknown): void;
	error(message: string, data?: unknown): void;
};

export type CachedFetcher = {
	fetch<T>(key: string, loader: () => Promise<T>): Promise<T>;
};

export type RuleConfigBag = Record<string, unknown>;

export type RuleContext = {
	repo: RepoRef;
	octokit: Octokit;
	cache: CachedFetcher;
	logger: Logger;
	ruleConfig: RuleConfigBag;
};

export type Rule = {
	id: string;
	category: RuleCategory;
	defaultSeverity: Severity;
	summary: string;
	docs: string;
	check(context: RuleContext): Promise<Finding[]>;
};
