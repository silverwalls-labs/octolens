import { getCodeownersErrors } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories whose CODEOWNERS file contains syntax or resolution errors.
 */
export const rule = defineRule({
	id: 'access/codeowners-valid',
	category: 'access',
	defaultSeverity: 'high',
	summary: 'CODEOWNERS file must have no errors',

	async check(ctx) {
		const result = await getCodeownersErrors(ctx.octokit, ctx.cache, ctx.repo);

		if (!result.checked || result.errorCount === 0) {
			return null;
		}

		return {
			title: `CODEOWNERS file has ${result.errorCount} error(s)`,
			detail: 'GitHub reported errors in the CODEOWNERS file ' +
				'(e.g. unknown user, unparseable pattern). Affected paths ' +
				'will not enforce code-owner reviews.',
			remediation: 'Open the CODEOWNERS errors view in the repository ' +
				'(/community or .github/CODEOWNERS) and fix the listed issues.',
		};
	},
});
