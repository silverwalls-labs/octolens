import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-approving-reviews';

const DETAIL = 'Pull requests can be merged with zero approvals on the default branch.';

const REMEDIATION = 'In the default branch protection rule, set ' +
	'"Require approvals" to at least 1.';

/**
 * Flags default branches that can merge without an approving review.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Pull requests must require at least one approving review',
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

		if (protection.requiredApprovingReviewCount >= 1) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Default branch does not require approving reviews',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
