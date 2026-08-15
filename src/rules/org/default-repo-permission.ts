import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/default-repo-permission';

const SAFE_PERMISSIONS = [ 'read', 'none' ];

const DETAIL = 'Every organisation member automatically receives this permission ' +
	'on every repository. A write-or-higher base permission lets any member push ' +
	'to any repository, bypassing per-repo access control entirely.';

const REMEDIATION = 'Organization Settings -> Member privileges -> Base ' +
	'permissions: select "Read" or "No permission". Grant write access ' +
	'per-repository through teams instead.';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'high',
	summary: 'Organisation base repository permission must be read or none',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.defaultRepositoryPermission === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (SAFE_PERMISSIONS.includes(meta.defaultRepositoryPermission)) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			org: ctx.org,
			title: `Base repository permission is "${meta.defaultRepositoryPermission}"`,
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Setting base permissions for an organization',
					url: 'https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/setting-base-permissions-for-an-organization',
				},
			],
		};

		return [ finding ];
	},
};
