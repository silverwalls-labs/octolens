import { getCodeScanningStatus } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories with no code scanning analyses on record.
 */
export const rule = defineRule({
	id: 'security/code-scanning-enabled',
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Code scanning must be enabled',

	async check(ctx) {
		const status = await getCodeScanningStatus(ctx.octokit, ctx.cache, ctx.repo);

		if (!status.checked) {
			return skip('could not read code scanning status (no permission)');
		}

		if (status.hasAnalyses) {
			return null;
		}

		return {
			title: 'Code scanning is not enabled',
			detail: 'No code scanning analyses were found. Static analysis findings will not ' +
				'be surfaced for this repository.',
			remediation: 'Set up code scanning: Security -> Code ' +
				'scanning -> Set up. CodeQL works for most ' +
				'languages out of the box.',
			references: [
				{
					name: 'About code scanning',
					url: 'https://docs.github.com/en/code-security/code-scanning/introduction-to-code-scanning/about-code-scanning',
				},
			],
		};
	},
});
