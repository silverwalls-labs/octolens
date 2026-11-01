import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that can merge without an approving review.
 */
export const rule = defineRule({
	id: 'repo-config/require-approving-reviews',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Pull requests must require at least one approving review',

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
			return null;
		}

		if (protection.requiredApprovingReviewCount >= 1) {
			return null;
		}

		return {
			title: 'Default branch does not require approving reviews',
			detail: 'Pull requests can be merged with zero approvals on the default branch.',
			remediation: 'In the default branch protection rule, set ' +
				'"Require approvals" to at least 1.',
		};
	},
});
