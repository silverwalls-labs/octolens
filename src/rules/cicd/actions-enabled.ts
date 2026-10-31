import { getActionsPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories where GitHub Actions is turned off entirely.
 */
export const rule = defineRule({
	id: 'cicd/actions-enabled',
	category: 'cicd',
	defaultSeverity: 'info',
	summary: 'GitHub Actions should be enabled',

	async check(ctx) {
		const perms = await getActionsPermissions(ctx.octokit, ctx.cache, ctx.repo);

		if (!perms.checked) {
			return skip('could not read Actions permissions (no permission)');
		}

		if (perms.enabled) {
			return null;
		}

		return {
			title: 'GitHub Actions is disabled',
			detail: 'GitHub Actions is disabled for this repository. ' +
				'No workflows will run, including any security or release automation.',
			remediation: 'If Actions is intentionally disabled, ignore this finding. ' +
				'Otherwise enable it under Settings -> Actions -> General.',
		};
	},
});
