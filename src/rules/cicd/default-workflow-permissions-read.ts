import { getDefaultWorkflowPermissions } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'cicd/default-workflow-permissions-read';

const DETAIL = 'The default GITHUB_TOKEN granted to workflows has write permissions. ' +
	'A compromised action or pull request could push code, publish releases, or ' +
	'modify repository settings.';

const REMEDIATION = 'Settings -> Actions -> General -> Workflow permissions: ' +
	'select "Read repository contents and packages permissions". Grant additional ' +
	'scopes per-workflow with `permissions:` blocks instead.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'cicd',
	defaultSeverity: 'high',
	summary: 'Default GITHUB_TOKEN permissions must be read-only',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getDefaultWorkflowPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (perms.defaultPermissions === 'read') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Default workflow GITHUB_TOKEN has write permissions',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Permissions for the GITHUB_TOKEN',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/automatic-token-authentication',
				},
			],
		};

		return [ finding ];
	},
};
