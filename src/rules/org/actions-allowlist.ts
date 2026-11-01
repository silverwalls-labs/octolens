import { getOrgActionsPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineOrgRule } from '../define.ts';

/**
 * Flags organisations that let workflows run arbitrary actions
 * instead of a restricted selection.
 */
export const rule = defineOrgRule({
	id: 'org/actions-allowlist',
	defaultSeverity: 'medium',
	summary: 'Organisation must restrict which actions workflows can use',

	async check(ctx) {
		const perms = await getOrgActionsPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation Actions permissions (no permission)');
		}

		if (perms.enabledRepositories === 'none') {
			return null;
		}

		if (perms.allowedActions !== 'all') {
			return null;
		}

		return {
			title: 'All marketplace actions are allowed organisation-wide',
			detail: 'The organisation allows workflows to use any action from the ' +
				'marketplace. A malicious or hijacked third-party action runs with access ' +
				'to repository contents and secrets in every repo that uses it.',
			remediation: 'Organization Settings -> Actions -> General -> Policies: ' +
				'select "Allow <org>, and select non-<org>, actions and reusable workflows" ' +
				'and allowlist the actions you trust (GitHub-owned, verified creators, or ' +
				'pinned patterns).',
			references: [
				{
					name: 'Disabling or limiting GitHub Actions for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization',
				},
			],
		};
	},
});
