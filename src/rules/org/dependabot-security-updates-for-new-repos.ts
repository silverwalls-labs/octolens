import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that do not enable Dependabot security updates
 * automatically on newly created repositories.
 */
export const rule = defineOrgRule({
	id: 'org/dependabot-security-updates-for-new-repos',
	defaultSeverity: 'medium',
	summary: 'Dependabot security updates must be enabled for new repositories',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.dependabotSecurityUpdatesEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.dependabotSecurityUpdatesEnabledForNewRepos) {
			return null;
		}

		return {
			title: 'Dependabot security updates are not enabled for new repositories',
			detail: 'Dependabot security updates are not enabled automatically for ' +
				'new repositories. New repos will see vulnerable dependencies flagged (if ' +
				'alerts are on) but no fix PRs will be opened for them.',
			remediation: 'Organization Settings -> Advanced Security -> Global ' +
				'settings: enable Dependabot security updates "Automatically enable for ' +
				'new repositories" (or attach a code security configuration that enables it).',
			references: [
				{
					name: 'Managing security and analysis settings for your organization',
					url: 'https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-security-and-analysis-settings-for-your-organization',
				},
			],
		};
	},
});
