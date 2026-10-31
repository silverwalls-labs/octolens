import { getOrgMetadata } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

const SAFE_PERMISSIONS = [ 'read', 'none' ];

/**
 * Flags organisations whose base permission grants members write or
 * admin on every repository.
 */
export const rule = defineOrgRule({
	id: 'org/default-repo-permission',
	defaultSeverity: 'high',
	summary: 'Organisation base repository permission must be read or none',

	async check(ctx) {
		const meta = await getOrgMetadata(ctx.octokit, ctx.cache, ctx.org);

		if (meta.defaultRepositoryPermission === undefined) {
			return skip('organisation settings not visible (requires org owner token)');
		}

		if (SAFE_PERMISSIONS.includes(meta.defaultRepositoryPermission)) {
			return null;
		}

		return {
			title: `Base repository permission is "${meta.defaultRepositoryPermission}"`,
			detail: 'Every organisation member automatically receives this permission ' +
				'on every repository. A write-or-higher base permission lets any member push ' +
				'to any repository, bypassing per-repo access control entirely.',
			remediation: 'Organization Settings -> Member privileges -> Base ' +
				'permissions: select "Read" or "No permission". Grant write access ' +
				'per-repository through teams instead.',
			references: [
				{
					name: 'Setting base permissions for an organization',
					url: 'https://docs.github.com/en/organizations/managing-user-access-to-your-organizations-repositories/managing-repository-roles/setting-base-permissions-for-an-organization',
				},
			],
		};
	},
});
