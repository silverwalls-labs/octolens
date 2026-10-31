import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with an empty topic list.
 */
export const rule = defineRule({
	id: 'repo-config/topics-present',
	category: 'repo-config',
	defaultSeverity: 'info',
	summary: 'Repository should declare at least one topic',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.topics.length > 0) {
			return null;
		}

		return {
			title: 'Repository has no topics',
			detail: 'This repository has no topics. Topics are how ' +
				'repositories surface in org-wide search, dependency ' +
				'dashboards, and inventory tooling — without them ' +
				'the repo is invisible to anyone who does not ' +
				'already know its name.',
			remediation: 'About panel (right of repo home) -> add 1-5 topics that describe ' +
				'the repo\'s purpose and stack (e.g. "cli", "typescript", "security-scanner").',
		};
	},
});
