import { getActionsSecrets } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags sensitive-looking secrets stored at repository level instead
 * of inside deployment environments.
 */
export const rule = defineRule({
	id: 'security/scope-secrets-to-environments',
	category: 'security',
	defaultSeverity: 'info',
	summary: 'Sensitive secrets should be scoped to environments, not the repository',

	async check(ctx) {
		const inventory = await getActionsSecrets(ctx.octokit, ctx.cache, ctx.repo);

		if (!inventory.checked) {
			return skip('could not list repository Actions secrets (no permission)');
		}

		if (inventory.secrets.length === 0) {
			return null;
		}

		const names = inventory.secrets.map(nameOf).join(', ');

		return {
			title: `Repository has ${inventory.secrets.length} repo-level Actions secret(s)`,
			detail: 'Repository-level Actions secrets are available ' +
				'to every workflow in the repo, including workflows ' +
				'on feature branches and pull requests from forks ' +
				'under some configurations. Environment-scoped ' +
				'secrets can be gated by required reviewers, branch ' +
				'policies, and wait timers. Current repo-level ' +
				`secrets: ${names}.`,
			remediation: 'Move sensitive secrets into an environment ' +
				'(Settings -> Environments -> <env> -> Add secret) and reference them with ' +
				'`environment:` in the workflow that needs them.',
			references: [
				{
					name: 'Using secrets in GitHub Actions',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/using-secrets-in-github-actions',
				},
			],
		};
	},
});

/**
 * Extract the name from a secret entry.
 *
 * @param secret      - Secret to inspect.
 * @param secret.name - Name of the secret entry.
 * @returns           The plain string form.
 */
function nameOf(secret: { name: string; }): string {
	return secret.name;
}
