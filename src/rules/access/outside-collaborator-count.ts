import { getOutsideCollaborators } from '../../github/queries.ts';
import type { Collaborator } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

/**
 * Flags repositories that grant access to accounts outside the organisation.
 */
export const rule = defineRule({
	id: 'access/outside-collaborator-count',
	category: 'access',
	defaultSeverity: 'low',
	summary: 'Repository should not have outside collaborators',

	async check(ctx) {
		const collaborators = await getOutsideCollaborators(ctx.octokit, ctx.cache, ctx.repo);

		if (collaborators.length === 0) {
			return null;
		}

		const logins = collaborators.map(loginOf).join(', ');

		return {
			title: `Repository has ${collaborators.length} outside collaborator(s)`,
			detail: 'Outside collaborators (users with repo access but not org members) ' +
				'do not appear in org-wide audits and may bypass policies that target members. ' +
				'Each one is a long-lived access grant that should be reviewed. ' +
				`Current outside collaborators: ${logins}.`,
			remediation: 'Audit Settings -> Collaborators and remove unused outside ' +
				'collaborators. Where possible, invite users to the organization with team-based ' +
				'access instead.',
		};
	},
});

/**
 * Extract the account login from a collaborator.
 *
 * @param collaborator - Collaborator to inspect.
 * @returns            Login of the collaborator.
 */
function loginOf(collaborator: Collaborator): string {
	return collaborator.login;
}
