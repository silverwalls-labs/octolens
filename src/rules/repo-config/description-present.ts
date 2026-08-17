import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/description-present';

const DETAIL = 'This repository has no description. Without one, the org repo list, ' +
	'search results, and external links show only the repo name — making the project ' +
	'easy to misidentify or overlook in audits and inventories.';

const REMEDIATION = 'About panel (right of repo home) -> Edit -> add a one-line ' +
	'description (what this repo is, who owns it, what it produces).';

/**
 * Flags repositories with an empty description field.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'info',
	summary: 'Repository should have a description',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.description && meta.description.trim().length > 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'info',
			repo: ctx.repo,
			title: 'Repository has no description',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
