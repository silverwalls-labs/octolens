import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/two-factor-required';

const DETAIL = 'The organisation does not require two-factor authentication for ' +
	'its members. A single phished or reused password is enough to compromise an ' +
	'account with access to every repository it can reach.';

const REMEDIATION = 'Organization Settings -> Authentication security: enable ' +
	'"Require two-factor authentication for everyone in your organization". ' +
	'Members without 2FA are removed from the organisation, so announce it first.';

/**
 * Flags organisations that do not enforce two-factor authentication
 * for membership. Skips when the token cannot see the setting.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Organisation must require two-factor authentication',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.twoFactorRequirementEnabled === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.twoFactorRequirementEnabled) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: 'Two-factor authentication is not required',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Requiring two-factor authentication in your organization',
					url: 'https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
