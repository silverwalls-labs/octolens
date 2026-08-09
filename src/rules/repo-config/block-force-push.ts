import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/block-force-push';

const DETAIL = 'Force pushes to the default branch are allowed, which can rewrite history ' +
	'and erase merged work.';

const REMEDIATION = 'In the default branch protection rule, disable "Allow force pushes".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Force pushes must be disabled on the default branch',
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

		if (!protection.allowsForcePushes) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: `Default branch '${meta.defaultBranch}' allows force pushes`,
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
