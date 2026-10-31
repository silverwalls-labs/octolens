import { getDefaultWorkflowPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories whose default `GITHUB_TOKEN` grants write access to workflows.
 */
export const rule = defineRule({
	id: 'cicd/default-workflow-permissions-read',
	category: 'cicd',
	defaultSeverity: 'high',
	summary: 'Default GITHUB_TOKEN permissions must be read-only',

	async check(ctx) {
		const perms = await getDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.checked) {
			return skip('could not read workflow permissions (no permission)');
		}

		if (perms.defaultPermissions === 'read') {
			return null;
		}

		return {
			title: 'Default workflow GITHUB_TOKEN has write permissions',
			detail: 'The default GITHUB_TOKEN granted to workflows has write permissions. ' +
				'A compromised action or pull request could push code, publish releases, or ' +
				'modify repository settings.',
			remediation: 'Settings -> Actions -> General -> Workflow permissions: ' +
				'select "Read repository contents and packages permissions". Grant additional ' +
				'scopes per-workflow with `permissions:` blocks instead.',
			references: [
				{
					name: 'Permissions for the GITHUB_TOKEN',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication',
				},
			],
		};
	},
});
