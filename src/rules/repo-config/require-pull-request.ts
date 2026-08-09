import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-pull-request';

const DETAIL = 'The default branch does not require pull requests, so commits can be ' +
	'pushed directly without review.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Require a pull request before merging".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Pull requests must be required before merging to the default branch',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (!protection.exists || protection.requiredPullRequest) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: `Default branch '${meta.defaultBranch}' does not require pull requests`,
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
