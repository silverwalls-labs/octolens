import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags private or internal repositories that allow forking.
 */
export const rule = defineRule({
	id: 'repo-config/forbid-forking-private-repos',
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Private and internal repositories should not be forkable',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.visibility === 'public') {
			return null;
		}

		if (!meta.allowForking) {
			return null;
		}

		return {
			title: `Forking is enabled on this ${meta.visibility} repository`,
			detail: 'Forking is enabled on this non-public repository. A fork copies the ' +
				'full code and history into a repo the original owners no longer control, ' +
				'creating a data-exfiltration path that bypasses the access, branch-protection, ' +
				'and audit controls on the source repository.',
			remediation: 'Settings -> General -> uncheck "Allow forking". For an org-wide ' +
				'default, disable forking of private/internal repositories in the organization ' +
				'member-privileges settings.',
			references: [
				{
					name: 'Managing the forking policy for your repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-the-forking-policy-for-your-repository',
				},
			],
		};
	},
});
