import { getDirectCollaborators } from '../../github/queries.ts';
import type { Collaborator } from '../../github/queries.ts';
import { defineRule } from '../define.ts';

const ADMIN_THRESHOLD = 3;

/**
 * Flags repositories that grant the admin role to more direct
 * collaborators than the built-in threshold allows.
 */
export const rule = defineRule({
	id: 'access/admin-count',
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Repository should not have an excessive number of admins',

	async check(ctx) {
		const collaborators = await getDirectCollaborators(ctx.octokit, ctx.cache, ctx.repo);
		const admins = collaborators.filter(isAdmin);

		if (admins.length <= ADMIN_THRESHOLD) {
			return null;
		}

		const logins = admins.map(loginOf).join(', ');

		return {
			title: `Repository has ${admins.length} admins (threshold: ${ADMIN_THRESHOLD})`,
			detail: 'A large number of admin users widens the blast radius of a single ' +
				'compromised account. Admins can change branch protection, manage secrets, and ' +
				`override required reviews. Current admins: ${logins}.`,
			remediation: 'Audit Settings -> Collaborators and demote unnecessary admins to ' +
				'maintain or write. Prefer team-based admin grants over individual ones.',
		};
	},
});

/**
 * Check whether a collaborator holds the admin role.
 *
 * @param collaborator - Collaborator to inspect.
 * @returns            True for admin collaborators.
 */
function isAdmin(collaborator: Collaborator): boolean {
	return collaborator.permission === 'admin';
}

/**
 * Extract the account login from a collaborator.
 *
 * @param collaborator - Collaborator to inspect.
 * @returns            Login of the collaborator.
 */
function loginOf(collaborator: Collaborator): string {
	return collaborator.login;
}
