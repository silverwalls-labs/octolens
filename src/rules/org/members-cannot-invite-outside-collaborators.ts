import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/members-cannot-invite-outside-collaborators';

const DETAIL = 'Members with admin permissions on a repository can invite ' +
	'outside collaborators. Accounts outside the organisation gain repository ' +
	'access without owner review, bypassing 2FA policy and SSO enforcement.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Repository ' +
	'invitations: uncheck "Allow members to invite outside collaborators to ' +
	'repositories for this organization". Invitations then require an ' +
	'organisation owner.';

/**
 * Flags organisations where members can invite outside collaborators
 * without owner involvement.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Members must not be able to invite outside collaborators',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.membersCanInviteOutsideCollaborators === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (!meta.membersCanInviteOutsideCollaborators) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'Members can invite outside collaborators',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Setting permissions for adding outside collaborators',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/setting-permissions-for-adding-outside-collaborators',
				},
			],
		};

		return [ finding ];
	},
};
