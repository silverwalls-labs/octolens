import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/topics-present';

const DETAIL = 'This repository has no topics. Topics are how repositories surface in ' +
	'org-wide search, dependency dashboards, and inventory tooling — without them the ' +
	'repo is invisible to anyone who does not already know its name.';

const REMEDIATION = 'About panel (right of repo home) -> add 1-5 topics that describe ' +
	'the repo\'s purpose and stack (e.g. "cli", "typescript", "security-scanner").';

/**
 * Flags repositories with an empty topic list.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'info',
	summary: 'Repository should declare at least one topic',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.topics.length > 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'info',
			repo: ctx.repo,
			title: 'Repository has no topics',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
