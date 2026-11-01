import { getActionsPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories that allow any action to run instead of
 * restricting workflows to a vetted allowlist.
 */
export const rule = defineRule({
	id: 'cicd/actions-allowlist',
	category: 'cicd',
	defaultSeverity: 'medium',
	summary: 'Third-party actions should be restricted to an allowlist',

	async check(ctx) {
		const perms = await getActionsPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.checked) {
			return skip('could not read Actions permissions (no permission)');
		}

		if (!perms.enabled) {
			return null;
		}

		if (perms.allowedActions !== 'all') {
			return null;
		}

		return {
			title: 'All actions and reusable workflows are allowed',
			detail: 'Workflows in this repository can run any ' +
				'third-party action from the Marketplace. A malicious ' +
				'or compromised action could exfiltrate secrets or ' +
				'push code.',
			remediation: 'Settings -> Actions -> General -> Allow ' +
				'actions: select either "Allow <owner> actions and ' +
				'reusable workflows" or "Allow enterprise, and select ' +
				'non-enterprise, actions and reusable workflows", ' +
				'and pin trusted actions with full SHAs in the ' +
				'allowlist.',
			references: [
				{
					name: 'Disabling or limiting GitHub Actions for your repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository',
				},
			],
		};
	},
});
