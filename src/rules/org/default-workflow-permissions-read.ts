import { getOrgDefaultWorkflowPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations whose default `GITHUB_TOKEN` grants write access to workflows.
 */
export const rule = defineOrgRule({
	id: 'org/default-workflow-permissions-read',
	defaultSeverity: 'high',
	summary: 'Organisation default GITHUB_TOKEN permissions must be read-only',

	async check(ctx) {
		const perms = await getOrgDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation workflow permissions (no permission)');
		}

		if (perms.defaultPermissions === 'read') {
			return null;
		}

		return {
			title: 'Organisation default workflow GITHUB_TOKEN has write permissions',
			detail: 'The organisation-wide default grants the GITHUB_TOKEN write ' +
				'permissions in every repository that has not overridden it. A compromised ' +
				'action or pull request could push code, publish releases, or modify ' +
				'settings across the organisation.',
			remediation: 'Organization Settings -> Actions -> General -> Workflow ' +
				'permissions: select "Read repository contents and packages permissions". ' +
				'Grant additional scopes per-workflow with `permissions:` blocks instead.',
			references: [
				{
					name: 'Permissions for the GITHUB_TOKEN',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication',
				},
			],
		};
	},
});
