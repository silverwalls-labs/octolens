import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations where members can invite outside collaborators
 * without owner involvement.
 */
export const rule = defineOrgRule({
	id: 'org/members-cannot-invite-outside-collaborators',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to invite outside collaborators',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanInviteOutsideCollaborators === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanInviteOutsideCollaborators) {
			return null;
		}

		return {
			title: 'Members can invite outside collaborators',
			detail: 'Members with admin permissions on a repository can invite ' +
				'outside collaborators. Accounts outside the organisation gain repository ' +
				'access without owner review, bypassing 2FA policy and SSO enforcement.',
			remediation: 'Organization Settings -> Member privileges -> Repository ' +
				'invitations: uncheck "Allow members to invite outside collaborators to ' +
				'repositories for this organization". Invitations then require an ' +
				'organisation owner.',
			references: [
				{
					name: 'Setting permissions for adding outside collaborators',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/setting-permissions-for-adding-outside-collaborators',
				},
			],
		};
	},
});
