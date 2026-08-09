import { getActionsSecrets } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/scope-secrets-to-environments';

const DETAIL = 'Repository-level Actions secrets are available to every workflow ' +
	'in the repo, including workflows on feature branches and pull requests from ' +
	'forks under some configurations. Environment-scoped secrets can be gated by ' +
	'required reviewers, branch policies, and wait timers.';

const REMEDIATION = 'Move sensitive secrets into an environment ' +
	'(Settings -> Environments -> <env> -> Add secret) and reference them with ' +
	'`environment:` in the workflow that needs them.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'info',
	summary: 'Sensitive secrets should be scoped to environments, not the repository',
	docs: RULE_ID,

	async check(ctx) {
		const inventory = await getActionsSecrets(ctx.octokit, ctx.cache, ctx.repo);

		if (!inventory.checked) {
			return skip('could not list repository Actions secrets (no permission)');
		}

		if (inventory.secrets.length === 0) {
			return [];
		}

		const names = inventory.secrets.map(nameOf).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'info',
			repo: ctx.repo,
			title: `Repository has ${inventory.secrets.length} repo-level Actions secret(s)`,
			detail: `${DETAIL} Current repo-level secrets: ${names}.`,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Using secrets in GitHub Actions',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions',
				},
			],
		};

		return [ finding ];
	},
};

function nameOf(secret: { name: string; }): string {
	return secret.name;
}
