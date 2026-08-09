import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-status-checks';

const DETAIL = 'No status checks are required to pass before merging to the default branch.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Require status checks to pass" and select the required workflows.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'At least one required status check must be configured',
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
			return [];
		}

		if (protection.requiredStatusCheckContexts.length > 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'No required status checks configured',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
