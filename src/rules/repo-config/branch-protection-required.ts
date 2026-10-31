import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories whose default branch has no protection rule at all.
 */
export const rule = defineRule({
	id: 'repo-config/branch-protection-required',
	category: 'repo-config',
	defaultSeverity: 'critical',
	summary: 'Default branch must have a protection rule',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (protection.exists) {
			return null;
		}

		return {
			title: `Default branch '${meta.defaultBranch}' is not protected`,
			detail: 'The default branch has no protection rule, so anyone with write access ' +
				'can bypass review or push directly.',
			remediation: 'Add a branch protection rule for the default branch under ' +
				'Settings -> Branches.',
			references: [
				{
					name: 'About protected branches',
					url: 'https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches',
				},
			],
		};
	},
});
