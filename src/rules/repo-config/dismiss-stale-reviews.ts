import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that keep stale approvals when new commits are pushed.
 */
export const rule = defineRule({
	id: 'repo-config/dismiss-stale-reviews',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Stale reviews must be dismissed on new commits',

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

		if (protection.dismissStaleReviews) {
			return null;
		}

		return {
			title: 'Stale reviews are not dismissed on new commits',
			detail: 'Approving reviews are not dismissed when new commits are pushed, so a PR ' +
				'can be merged with approvals that pre-date the latest changes.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Dismiss stale pull request approvals when new commits are pushed".',
		};
	},
});
