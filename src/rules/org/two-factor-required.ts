import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that do not enforce two-factor authentication
 * for membership. Skips when the token cannot see the setting.
 */
export const rule = defineOrgRule({
	id: 'org/two-factor-required',
	defaultSeverity: 'high',
	summary: 'Organisation must require two-factor authentication',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.twoFactorRequirementEnabled === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (meta.twoFactorRequirementEnabled) {
			return null;
		}

		return {
			title: 'Two-factor authentication is not required',
			detail: 'The organisation does not require two-factor authentication for ' +
				'its members. A single phished or reused password is enough to compromise an ' +
				'account with access to every repository it can reach.',
			remediation: 'Organization Settings -> Authentication security: enable ' +
				'"Require two-factor authentication for everyone in your organization". ' +
				'Members without 2FA are removed from the organisation, so announce it first.',
			references: [
				{
					name: 'Requiring two-factor authentication in your organization',
					url: 'https://docs.github.com/en/organizations/keeping-your-organization-secure/managing-two-factor-authentication-for-your-organization/requiring-two-factor-authentication-in-your-organization',
				},
			],
		};
	},
});
