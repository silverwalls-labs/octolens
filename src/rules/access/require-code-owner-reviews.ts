import {
	getBranchProtection,
	getCodeownersFilePresent,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories that have a CODEOWNERS file but do not enforce
 * code owner review on the default branch.
 */
export const rule = defineRule({
	id: 'access/require-code-owner-reviews',
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Code owner reviews must be required when CODEOWNERS is present',

	async check(ctx) {
		const codeownersPresent = await getCodeownersFilePresent(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
		);

		if (!codeownersPresent) {
			return skip('no CODEOWNERS file present');
		}

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

		if (protection.requireCodeOwnerReviews) {
			return null;
		}

		return {
			title: 'Code owner reviews are not required',
			detail: 'A CODEOWNERS file is committed to this repository, but the default ' +
				'branch protection rule does not require review from code owners. ' +
				'Pull requests touching owned paths can merge without owner approval.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Require review from Code Owners" alongside required pull-request reviews.',
			references: [
				{
					name: 'About code owners',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners',
				},
			],
		};
	},
});
