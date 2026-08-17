import { getOutsideCollaborators } from '../../github/queries.ts';
import type { Collaborator } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/outside-collaborator-count';

const DETAIL = 'Outside collaborators (users with repo access but not org members) ' +
	'do not appear in org-wide audits and may bypass policies that target members. ' +
	'Each one is a long-lived access grant that should be reviewed.';

const REMEDIATION = 'Audit Settings -> Collaborators and remove unused outside ' +
	'collaborators. Where possible, invite users to the organization with team-based ' +
	'access instead.';

/**
 * Flags repositories that grant access to accounts outside the organisation.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'low',
	summary: 'Repository should not have outside collaborators',
	docs: RULE_ID,

	async check(ctx) {
		const collaborators = await getOutsideCollaborators(ctx.octokit, ctx.cache, ctx.repo);

		if (collaborators.length === 0) {
			return [];
		}

		const logins = collaborators.map(loginOf).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			repo: ctx.repo,
			title: `Repository has ${collaborators.length} outside collaborator(s)`,
			detail: `${DETAIL} Current outside collaborators: ${logins}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

/**
 * Extract the account login from a collaborator.
 *
 * @param collaborator - Collaborator to inspect.
 * @returns            Login of the collaborator.
 */
function loginOf(collaborator: Collaborator): string {
	return collaborator.login;
}
