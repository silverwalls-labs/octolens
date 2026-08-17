import { getDirectCollaborators } from '../../github/queries.ts';
import type {
	Collaborator,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/admin-count';
const ADMIN_THRESHOLD = 3;

const DETAIL = 'A large number of admin users widens the blast radius of a single ' +
	'compromised account. Admins can change branch protection, manage secrets, and ' +
	'override required reviews.';

const REMEDIATION = 'Audit Settings -> Collaborators and demote unnecessary admins to ' +
	'maintain or write. Prefer team-based admin grants over individual ones.';

/**
 * Flags repositories that grant the admin role to more direct
 * collaborators than the built-in threshold allows.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Repository should not have an excessive number of admins',
	docs: RULE_ID,

	async check(ctx) {
		const collaborators = await getDirectCollaborators(ctx.octokit, ctx.cache, ctx.repo);
		const admins = collaborators.filter(isAdmin);

		if (admins.length <= ADMIN_THRESHOLD) {
			return [];
		}

		const logins = admins.map(loginOf).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: `Repository has ${admins.length} admins (threshold: ${ADMIN_THRESHOLD})`,
			detail: `${DETAIL} Current admins: ${logins}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

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
