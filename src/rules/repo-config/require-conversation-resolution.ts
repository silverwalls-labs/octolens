import {
	getBranchProtection,
	getRepoMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags default branches that can merge with unresolved review conversations.
 */
export const rule = defineRule({
	id: 'repo-config/require-conversation-resolution',
	category: 'repo-config',
	defaultSeverity: 'medium',
	summary: 'Conversation resolution must be required before merge',

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
			return null;
		}

		return {
			title: 'Conversation resolution is not required before merge',
			detail: 'Pull requests can be merged with unresolved review conversations, which can ' +
				'leave reviewer concerns unanswered.',
			remediation: 'In the default branch protection rule, enable ' +
				'"Require conversation resolution before merging".',
		};
	},
});
