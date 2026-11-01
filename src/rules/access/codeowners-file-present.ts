import { getCodeownersFilePresent } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories without a CODEOWNERS file in any of the standard locations.
 */
export const rule = defineRule({
	id: 'access/codeowners-file-present',
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'A CODEOWNERS file must be present',

	async check(ctx) {
		const present = await getCodeownersFilePresent(ctx.octokit, ctx.cache, ctx.repo);

		if (present) {
			return null;
		}

		return {
			title: 'No CODEOWNERS file found',
			detail: 'No CODEOWNERS file was found, so GitHub cannot route review requests by ' +
				'path or enforce code-owner approvals.',
			remediation: 'Add a CODEOWNERS file at the repository root or under .github/.',
			references: [
				{
					name: 'About code owners',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/about-code-owners',
				},
			],
		};
	},
});
