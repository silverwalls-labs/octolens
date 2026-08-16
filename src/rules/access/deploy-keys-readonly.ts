import { getDeployKeys } from '../../github/queries.ts';
import type { DeployKeySummary } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/deploy-keys-readonly';

const DETAIL = 'One or more deploy keys have write access. Deploy keys are persistent ' +
	'push credentials that bypass branch protection and personal account audit trails, ' +
	'and they often outlive the people or systems that created them.';

const REMEDIATION = 'Settings -> Deploy keys: replace each writable key with a ' +
	'read-only deploy key, or move write workflows to a GitHub App or short-lived ' +
	'token (`GITHUB_TOKEN`, OIDC).';

/**
 * Flags deploy keys that have write access to the repository.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Deploy keys should be read-only',
	docs: RULE_ID,

	async check(ctx) {
		const keys = await getDeployKeys(ctx.octokit, ctx.cache, ctx.repo);
		const writable = keys.filter(isWritable);

		if (writable.length === 0) {
			return [];
		}

		const summary = writable.map(describe).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: `${writable.length} deploy key(s) have write access`,
			detail: `${DETAIL} Writable keys: ${summary}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

/**
 * Check whether a deploy key allows writes.
 *
 * @param key - Deploy key to inspect.
 * @returns   True for read-write keys.
 */
function isWritable(key: DeployKeySummary): boolean {
	return !key.readOnly;
}

/**
 * Format a deploy key for the finding detail.
 *
 * @param key - Deploy key to inspect.
 * @returns   The formatted description.
 */
function describe(key: DeployKeySummary): string {
	return `#${key.id} '${key.title}'`;
}
