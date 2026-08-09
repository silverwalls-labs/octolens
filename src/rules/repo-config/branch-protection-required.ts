import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/branch-protection-required';

const DETAIL = 'The default branch has no protection rule, so anyone with write access ' +
	'can bypass review or push directly.';

const REMEDIATION = 'Add a branch protection rule for the default branch under ' +
	'Settings -> Branches.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'critical',
	summary: 'Default branch must have a protection rule',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (protection.exists) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'critical',
			repo: ctx.repo,
			title: `Default branch '${meta.defaultBranch}' is not protected`,
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About protected branches',
					url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches',
				},
			],
		};

		return [ finding ];
	},
};
