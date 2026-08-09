import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-linear-history';

const DETAIL = 'The default branch allows merge commits. Teams that prefer rebase / ' +
	'squash workflows may want a strictly linear history.';

const REMEDIATION = 'In the default branch protection rule, enable "Require linear history". ' +
	'Disable this rule via config if your team intentionally uses merge commits.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Linear history should be required on the default branch',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (!protection.exists) {
			return skip('default branch has no protection rule');
		}

		if (protection.requireLinearHistory) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			repo: ctx.repo,
			title: 'Linear history is not required on the default branch',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
