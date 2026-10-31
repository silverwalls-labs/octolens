import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches whose protection still permits force pushes.
 */
export const rule = defineRule({
	id: 'repo-config/block-force-push',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Force pushes must be disabled on the default branch',

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
			return null;
		}

		return {
			title: `Default branch '${meta.defaultBranch}' allows force pushes`,
			detail: 'Force pushes to the default branch are allowed, which can rewrite history ' +
				'and erase merged work.',
			remediation: 'In the default branch protection rule, disable "Allow force pushes".',
		};
	},
});
