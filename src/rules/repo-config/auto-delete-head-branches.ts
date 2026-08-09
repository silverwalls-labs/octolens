import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/auto-delete-head-branches';

const DETAIL = 'Merged head branches are not deleted automatically. ' +
	'Stale branches accumulate and make it harder to spot abandoned work or stale ' +
	'protection-rule exceptions.';

const REMEDIATION = 'Settings -> General -> Pull Requests: enable ' +
	'"Automatically delete head branches".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Merged head branches should be deleted automatically',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.deleteBranchOnMerge) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			repo: ctx.repo,
			title: 'Merged head branches are not deleted automatically',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
