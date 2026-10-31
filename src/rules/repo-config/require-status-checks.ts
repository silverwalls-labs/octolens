import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that merge without any required status check.
 */
export const rule = defineRule({
	id: 'repo-config/require-status-checks',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'At least one required status check must be configured',

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

		if (protection.requiredStatusCheckContexts.length > 0) {
			return null;
		}

		return {
			title: 'No required status checks configured',
			detail: 'No status checks are required to pass before merging to the default branch.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Require status checks to pass" and select the required workflows.',
		};
	},
});
