import type { Octokit } from '@octokit/rest';
import type {
	Finding, RepoRef, Rule,
} from '../../types/index.ts';

const RULE_ID = 'security/dependabot-alerts-enabled';

const DETAIL = 'GitHub will not surface known vulnerable dependencies ' +
	'for this repository while alerts are disabled.';

const REMEDIATION = 'Enable Dependabot alerts: ' +
	'Settings -> Code security -> Dependabot alerts.';

/**
 * Flags repositories with vulnerability alerts turned off.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'high',
	summary: 'Dependabot alerts must be enabled',
	docs: RULE_ID,

	async check(ctx) {
		const enabled = await ctx.cache.fetch(
			`vuln-alerts:${ctx.repo.owner}/${ctx.repo.name}`,
			() => fetchAlertsEnabled(ctx.octokit, ctx.repo),
		);

		if (enabled) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: 'Dependabot alerts are disabled',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'About Dependabot alerts',
					url: 'https://docs.github.com/en/code-security/dependabot/dependabot-alerts/about-dependabot-alerts',
				},
			],
		};

		return [ finding ];
	},
};

/**
 * Query the vulnerability-alerts endpoint, mapping 404 to disabled.
 *
 * @param octokit - Authenticated Octokit client.
 * @param repo    - Target repository.
 * @returns       Whether alerts are enabled.
 */
async function fetchAlertsEnabled(octokit: Octokit, repo: RepoRef): Promise<boolean> {
	try {
		await octokit.rest.repos.checkVulnerabilityAlerts({
			owner: repo.owner,
			repo: repo.name,
		});

		return true;
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return false;
		}
		throw err;
	}
}

/**
 * Error shape carrying an HTTP status code.
 */
type WithStatus = {
	status: unknown;
};

/**
 * Check whether an error carries the given HTTP status.
 *
 * @param err    - Error thrown by an Octokit request.
 * @param status - HTTP status to test for.
 * @returns      True when the status matches.
 */
function isHttpStatus(err: unknown, status: number): boolean {
	return typeof err === 'object' &&
		err !== null &&
		'status' in err &&
		(err as WithStatus).status === status;
}
