import { getRepoTeams } from '../../github/queries.ts';
import type { RepoTeamSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/team-based-admin';

const DETAIL = 'No team has admin access on this repository. Granting admin to ' +
	'individuals creates orphaned access when they leave and makes audits harder.';

const REMEDIATION = 'Create a team in the organization and grant it admin access ' +
	'to this repo. Manage admin membership through the team rather than per-user.';

/**
 * Flags repositories where no team holds admin access, encouraging
 * team-based over individual grants.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'info',
	summary: 'At least one team should have admin access',
	docs: RULE_ID,

	async check(ctx) {
		const result = await getRepoTeams(ctx.octokit, ctx.cache, ctx.repo);

		if (!result.checked) {
			return skip('could not list repository teams (no permission)');
		}

		if (result.teams.some(isAdminTeam)) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'info',
			repo: ctx.repo,
			title: 'No team has admin access on this repository',
			detail: DETAIL,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

/**
 * Check whether a team grants the admin permission.
 *
 * @param team - Team to inspect.
 * @returns    True for teams with admin permission.
 */
function isAdminTeam(team: RepoTeamSummary): boolean {
	return team.permission === 'admin';
}
