import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/dependabot-security-updates-for-new-repos';

const DETAIL = 'Dependabot security updates are not enabled automatically for ' +
	'new repositories. New repos will see vulnerable dependencies flagged (if ' +
	'alerts are on) but no fix PRs will be opened for them.';

const REMEDIATION = 'Organization Settings -> Advanced Security -> Global ' +
	'settings: enable Dependabot security updates "Automatically enable for ' +
	'new repositories" (or attach a code security configuration that enables it).';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Dependabot security updates must be enabled for new repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.dependabotSecurityUpdatesEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.dependabotSecurityUpdatesEnabledForNewRepos) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Dependabot security updates are not enabled for new repositories',
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
