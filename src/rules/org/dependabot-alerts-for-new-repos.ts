import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/dependabot-alerts-for-new-repos';

const DETAIL = 'Dependabot alerts are not enabled automatically for new ' +
	'repositories, so every new repo starts blind to known-vulnerable ' +
	'dependencies until someone remembers to turn alerts on.';

const REMEDIATION = 'Organization Settings -> Advanced Security -> Global ' +
	'settings: enable Dependabot alerts "Automatically enable for new ' +
	'repositories" (or attach a code security configuration that enables it).';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Dependabot alerts must be enabled for new repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.dependabotAlertsEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.dependabotAlertsEnabledForNewRepos) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Dependabot alerts are not enabled for new repositories',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Managing security and analysis settings for your organization',
					url: 'https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-security-settings-for-your-organization/managing-security-and-analysis-settings-for-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
