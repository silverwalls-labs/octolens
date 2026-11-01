import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches whose protection exempts administrators.
 */
export const rule = defineRule({
	id: 'repo-config/enforce-admins',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Branch protection must apply to administrators',

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

		if (protection.enforceAdmins) {
			return null;
		}

		return {
			title: 'Branch protection is not enforced for administrators',
			detail: 'Admins are exempt from the default branch protection rules, so they can ' +
				'bypass review and other guarantees.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Do not allow bypassing the above settings" (a.k.a. "Include administrators").',
		};
	},
});
