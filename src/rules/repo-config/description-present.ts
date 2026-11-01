import { getRepoMetadata } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with an empty description field.
 */
export const rule = defineRule({
	id: 'repo-config/description-present',
	category: 'repo-config',
	defaultSeverity: 'info',
	summary: 'Repository should have a description',

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.description && meta.description.trim().length > 0) {
			return null;
		}

		return {
			title: 'Repository has no description',
			detail: 'This repository has no description. Without one, the org repo list, ' +
				'search results, and external links show only the repo name — making the project ' +
				'easy to misidentify or overlook in audits and inventories.',
			remediation: 'About panel (right of repo home) -> Edit -> add a one-line ' +
				'description (what this repo is, who owns it, what it produces).',
		};
	},
});
