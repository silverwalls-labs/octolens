import type { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../github/fetcher.ts';
import { getRepoMetadata } from '../github/queries.ts';
import { meetsThreshold } from '../types/severity.ts';
import type {
	Finding,
	Logger,
	OctolensConfig,
	RepoRef,
	Rule,
	RuleConfigBag,
	ScanResult,
	ScanSummary,
	Severity,
} from '../types/index.ts';
import { runRule } from './run-rule.ts';

export type ScanRepoOptions = {
	repo: RepoRef;
	rules: Rule[];
	octokit: Octokit;
	logger: Logger;
	threshold: Severity;
	config?: OctolensConfig;
	ruleConfig?: RuleConfigBag;
};

export async function scanRepo(options: ScanRepoOptions): Promise<ScanResult> {
	const cache = createCachedFetcher();
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

function filterEnabledRules(rules: Rule[], config?: OctolensConfig): Rule[] {
	const overrides = config?.rules ?? {};

	return rules.filter((r) => overrides[r.id] !== 'off');
}

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
