import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that accept unsigned commits.
 */
export const rule = defineRule({
	id: 'repo-config/require-signed-commits',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Default branch should require signed commits',

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

		if (protection.requireSignedCommits) {
			return null;
		}

		return {
			title: `Default branch '${meta.defaultBranch}' does not require signed commits`,
			detail: 'The default branch does not require signed commits, so unsigned ' +
				'commits can land via merge or direct push. Signature requirements help detect ' +
				'tampered or impersonated commits.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Require signed commits".',
			references: [
				{
					name: 'About commit signature verification',
					url: 'https://docs.github.com/en/authentication/managing-commit-signature-verification/about-commit-signature-verification',
				},
			],
		};
	},
});
