import { getBranchCount } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

const BRANCH_THRESHOLD = 100;

/**
 * Flags repositories whose branch count exceeds the built-in threshold.
 */
export const rule = defineRule({
	id: 'repo-config/branch-count',
	category: 'repo-config',
	defaultSeverity: 'low',
	summary: 'Repository should not accumulate excessive branches',

	async check(ctx) {
		const count = await getBranchCount(ctx.octokit, ctx.cache, ctx.repo);

		if (count <= BRANCH_THRESHOLD) {
			return null;
		}

		return {
			title: `Repository has ${count} branches (threshold: ${BRANCH_THRESHOLD})`,
			detail: 'A high branch count usually means stale or abandoned branches accumulate ' +
				'in the repository. They clutter tooling, slow some Git operations, and can hide ' +
				'long-lived deviations from the default branch.',
			remediation: 'Enable "Automatically delete head branches" in Settings -> ' +
				'General -> Pull Requests, and prune merged or stale branches with ' +
				'`git branch --merged` or a scheduled cleanup job.',
		};
	},
});
