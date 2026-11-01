import { getDeployKeys } from '../../github/queries.ts';
import type { DeployKeySummary } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags deploy keys that have write access to the repository.
 */
export const rule = defineRule({
	id: 'access/deploy-keys-readonly',
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Deploy keys should be read-only',

	async check(ctx) {
		const keys = await getDeployKeys(ctx.octokit, ctx.cache, ctx.repo);
		const writable = keys.filter(isWritable);

		if (writable.length === 0) {
			return null;
		}

		const summary = writable.map(describe).join(', ');

		return {
			title: `${writable.length} deploy key(s) have write access`,
			detail: 'One or more deploy keys have write access. ' +
				'Deploy keys are persistent push credentials that bypass ' +
				'branch protection and personal account audit trails, ' +
				'and they often outlive the people or systems that created ' +
				`them. Writable keys: ${summary}.`,
			remediation: 'Settings -> Deploy keys: replace each writable key with a ' +
				'read-only deploy key, or move write workflows to a GitHub App or short-lived ' +
				'token (`GITHUB_TOKEN`, OIDC).',
		};
	},
});

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
