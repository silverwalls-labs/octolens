import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that do not enable secret scanning
 * automatically on newly created repositories.
 */
export const rule = defineOrgRule({
	id: 'org/secret-scanning-for-new-repos',
	defaultSeverity: 'medium',
	summary: 'Secret scanning must be enabled for new repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.secretScanningEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.secretScanningEnabledForNewRepos) {
			return null;
		}

		return {
			title: 'Secret scanning is not enabled for new repositories',
			detail: 'Secret scanning is not enabled automatically for new ' +
				'repositories. Tokens and keys committed to a new repo go undetected ' +
				'until scanning is switched on manually.',
			remediation: 'Organization Settings -> Advanced Security -> Global ' +
				'settings: enable Secret Protection "Automatically enable for new ' +
				'repositories" (or attach a code security configuration that enables it).',
			references: [
				{
					name: 'Managing security and analysis settings for your organization',
					url: 'https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-security-and-analysis-settings-for-your-organization',
				},
			],
		};
	},
});
