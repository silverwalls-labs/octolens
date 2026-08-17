import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/enforce-admins';

const DETAIL = 'Admins are exempt from the default branch protection rules, so they can ' +
	'bypass review and other guarantees.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Do not allow bypassing the above settings" (a.k.a. "Include administrators").';

/**
 * Flags default branches whose protection exempts administrators.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'high',
	summary: 'Branch protection must apply to administrators',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);
		const protection = await getBranchProtection(
			ctx.octokit,
			ctx.cache,
			ctx.repo,
			meta.defaultBranch,
		);

		if (!protection.exists) {
			return skip('default branch has no protection rule');
		}

		if (protection.enforceAdmins) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Branch protection is not enforced for administrators',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
