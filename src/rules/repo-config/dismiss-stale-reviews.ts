import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/dismiss-stale-reviews';

const DETAIL = 'Approving reviews are not dismissed when new commits are pushed, so a PR ' +
	'can be merged with approvals that pre-date the latest changes.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Dismiss stale pull request approvals when new commits are pushed".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Stale reviews must be dismissed on new commits',
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

		if (!protection.requiredPullRequest) {
			return [];
		}

		if (protection.dismissStaleReviews) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'Stale reviews are not dismissed on new commits',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
