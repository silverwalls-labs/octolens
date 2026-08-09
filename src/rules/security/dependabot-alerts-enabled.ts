import type { Octokit } from '@octokit/rest';
import type {
	Finding, RepoRef, Rule,
} from '../../types/index.ts';

const RULE_ID = 'security/dependabot-alerts-enabled';

const DETAIL = 'GitHub will not surface known vulnerable dependencies ' +
	'for this repository while alerts are disabled.';

const REMEDIATION = 'Enable Dependabot alerts: ' +
	'Settings -> Code security -> Dependabot alerts.';

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

type WithStatus = {
	status: unknown;
};

function isHttpStatus(err: unknown, status: number): boolean {
	return typeof err === 'object' &&
		err !== null &&
		'status' in err &&
		(err as WithStatus).status === status;
}
