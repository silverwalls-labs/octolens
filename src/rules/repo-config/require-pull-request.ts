import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that accept direct pushes without a pull request.
 */
export const rule = defineRule({
	id: 'repo-config/require-pull-request',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Pull requests must be required before merging to the default branch',

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

		if (protection.requiredPullRequest) {
			return null;
		}

		return {
			title: `Default branch '${meta.defaultBranch}' does not require pull requests`,
			detail: 'The default branch does not require pull requests, so commits can be ' +
				'pushed directly without review.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Require a pull request before merging".',
		};
	},
});
