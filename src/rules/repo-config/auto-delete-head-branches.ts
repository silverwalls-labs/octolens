import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories that keep merged head branches around instead
 * of deleting them automatically.
 */
export const rule = defineRule({
	id: 'repo-config/auto-delete-head-branches',
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Merged head branches should be deleted automatically',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.deleteBranchOnMerge) {
			return null;
		}

		return {
			title: 'Merged head branches are not deleted automatically',
			detail: 'Merged head branches are not deleted automatically. ' +
				'Stale branches accumulate and make it harder to spot abandoned work or stale ' +
				'protection-rule exceptions.',
			remediation: 'Settings -> General -> Pull Requests: enable ' +
				'"Automatically delete head branches".',
		};
	},
});
