import { getActionsPermissions } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'cicd/actions-allowlist';

const DETAIL = 'Workflows in this repository can run any third-party action from the ' +
	'Marketplace. A malicious or compromised action could exfiltrate secrets or push code.';

const REMEDIATION = 'Settings -> Actions -> General -> Allow actions: select either ' +
	'"Allow <owner> actions and reusable workflows" or "Allow enterprise, ' +
	'and select non-enterprise, actions and reusable workflows", and pin trusted actions ' +
	'with full SHAs in the allowlist.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'cicd',
	defaultSeverity: 'medium',
	summary: 'Third-party actions should be restricted to an allowlist',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getActionsPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.enabled) {
			return [];
		}

		if (perms.allowedActions !== 'all') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'All actions and reusable workflows are allowed',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Disabling or limiting GitHub Actions for your repository',
					url: 'https://docs.github.com/en/repositories/managing-your-repositorys-settings-and-features/enabling-features-for-your-repository/managing-github-actions-settings-for-a-repository',
				},
			],
		};

		return [ finding ];
	},
};
