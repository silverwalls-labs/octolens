import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'repo-config/require-conversation-resolution';

const DETAIL = 'Pull requests can be merged with unresolved review conversations, which can ' +
	'leave reviewer concerns unanswered.';

const REMEDIATION = 'In the default branch protection rule, enable ' +
	'"Require conversation resolution before merging".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Conversation resolution must be required before merge',
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

		if (protection.requireConversationResolution) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: 'Conversation resolution is not required before merge',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};
