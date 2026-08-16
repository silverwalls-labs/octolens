import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/secret-scanning-push-protection-for-new-repos';

const DETAIL = 'Secret scanning push protection is not enabled automatically ' +
	'for new repositories. Detecting a leaked secret after the push means ' +
	'rotating it; push protection blocks the commit before the secret lands.';

const REMEDIATION = 'Organization Settings -> Advanced Security -> Global ' +
	'settings: enable Push protection "Automatically enable for new ' +
	'repositories" (or attach a code security configuration that enables it).';

/**
 * Flags organisations that do not enable push protection
 * automatically on newly created repositories.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Secret scanning push protection must be enabled for new repositories',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.secretScanningPushProtectionEnabledForNewRepos === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.secretScanningPushProtectionEnabledForNewRepos) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Secret scanning push protection is not enabled for new repositories',
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
