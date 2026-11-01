import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that do not enable Dependabot alerts
 * automatically on newly created repositories.
 */
export const rule = defineOrgRule({
	id: 'org/dependabot-alerts-for-new-repos',
	defaultSeverity: 'medium',
	summary: 'Dependabot alerts must be enabled for new repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.dependabotAlertsEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.dependabotAlertsEnabledForNewRepos) {
			return null;
		}

		return {
			title: 'Dependabot alerts are not enabled for new repositories',
			detail: 'Dependabot alerts are not enabled automatically for new ' +
				'repositories, so every new repo starts blind to known-vulnerable ' +
				'dependencies until someone remembers to turn alerts on.',
			remediation: 'Organization Settings -> Advanced Security -> Global ' +
				'settings: enable Dependabot alerts "Automatically enable for new ' +
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
