import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that accept merge commits instead of
 * enforcing a linear history.
 */
export const rule = defineRule({
	id: 'repo-config/require-linear-history',
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Linear history should be required on the default branch',

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
			return null;
		}

		return {
			title: 'Linear history is not required on the default branch',
			detail: 'The default branch allows merge commits. Teams that prefer rebase / ' +
				'squash workflows may want a strictly linear history.',
			remediation: 'In the default branch protection rule, ' +
				'enable "Require linear history". Disable this rule ' +
				'via config if your team intentionally uses merge ' +
				'commits.',
		};
	},
});
