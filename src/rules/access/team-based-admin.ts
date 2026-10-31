import { getRepoTeams } from '../../github/queries.ts';
import type { RepoTeamSummary } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories where no team holds admin access, encouraging
 * team-based over individual grants.
 */
export const rule = defineRule({
	id: 'access/team-based-admin',
	category: 'access',
	defaultSeverity: 'info',
	summary: 'At least one team should have admin access',

	async check(ctx) {
		const result = await getRepoTeams(ctx.octokit, ctx.cache, ctx.repo);

		if (!result.checked) {
			return skip('could not list repository teams (no permission)');
		}

		if (result.teams.some(isAdminTeam)) {
			return null;
		}

		return {
			title: 'No team has admin access on this repository',
			detail: 'No team has admin access on this repository. Granting admin to ' +
				'individuals creates orphaned access when they leave and makes audits harder.',
			remediation: 'Create a team in the organization and grant it admin access ' +
				'to this repo. Manage admin membership through the team rather than per-user.',
		};
	},
});

/**
 * Check whether a team grants the admin permission.
 *
 * @param team - Team to inspect.
 * @returns    True for teams with admin permission.
 */
function isAdminTeam(team: RepoTeamSummary): boolean {
	return team.permission === 'admin';
}
