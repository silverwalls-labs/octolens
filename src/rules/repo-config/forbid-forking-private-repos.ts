import { getRepoMetadata } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/forbid-forking-private-repos';

const DETAIL = 'Forking is enabled on this non-public repository. A fork copies the ' +
	'full code and history into a repo the original owners no longer control, ' +
	'creating a data-exfiltration path that bypasses the access, branch-protection, ' +
	'and audit controls on the source repository.';

const REMEDIATION = 'Settings -> General -> uncheck "Allow forking". For an org-wide ' +
	'default, disable forking of private/internal repositories in the organization ' +
	'member-privileges settings.';

/**
 * Flags private or internal repositories that allow forking.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Private and internal repositories should not be forkable',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.visibility === 'public') {
			return [];
		}

		if (!meta.allowForking) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: `Forking is enabled on this ${meta.visibility} repository`,
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing the forking policy for your repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/managing-repository-settings/managing-the-forking-policy-for-your-repository',
				},
			],
		};

		return [ finding ];
	},
};
