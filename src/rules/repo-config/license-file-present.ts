import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories where GitHub detects no license.
 */
export const rule = defineRule({
	id: 'repo-config/license-file-present',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Repository must have a detected license',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.license && meta.license.spdxId && meta.license.spdxId !== 'NOASSERTION') {
			return null;
		}

		return {
			title: 'No license detected',
			detail: 'GitHub did not detect a license for this repository. Without a license, ' +
				'others cannot legally reuse the code.',
			remediation: 'Add a LICENSE file at the repository root using a standard SPDX ' +
				'identifier such as MIT or Apache-2.0.',
			references: [
				{
					name: 'Licensing a repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/customizing-your-repository/licensing-a-repository',
				},
			],
		};
	},
});
