import { getOrgActionsPermissions, getOrgAllowedActions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/actions-allowlist-pinned';

const SHA_PINNED = /^[^/]+\/[^/@]+@[0-9a-f]{40}$/i;

const DETAIL = 'The organisation action allowlist contains patterns that are ' +
	'not pinned to a full commit SHA. A wildcard, tag, or branch pattern ' +
	're-opens the supply-chain hole the allowlist closes: a hijacked tag or ' +
	'compromised owner account ships straight into every workflow.';

const REMEDIATION = 'Organization Settings -> Actions -> General -> Policies: ' +
	'replace wildcard and tag patterns with SHA-pinned entries ' +
	'(`owner/repo@<full-40-character-sha>`).';

/**
 * Flags organisation allowlist entries that reference actions by tag
 * or branch instead of a full commit SHA.
 */
export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Allowlisted actions must be pinned to a full commit SHA',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getOrgActionsPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation Actions permissions (no permission)');
		}

		/*
		 * Only applicable when an allowlist is in use — 'all' is flagged by
		 * org/actions-allowlist, 'local_only' and disabled need no patterns.
		 */
		if (perms.enabledRepositories === 'none' || perms.allowedActions !== 'selected') {
			return [];
		}

		const allowed = await getOrgAllowedActions(ctx.octokit, ctx.cache, ctx.org);

		if (!allowed.checked) {
			return skip('could not read organisation allowed-actions config (no permission)');
		}

		const unpinned = allowed.patternsAllowed.filter(isUnpinned);

		if (unpinned.length === 0) {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: `${unpinned.length} allowlisted action pattern(s) are not SHA-pinned`,
			detail: `${DETAIL} Unpinned patterns: ${unpinned.join(', ')}.`,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Using third-party actions (security hardening)',
					url: 'https://docs.github.com/en/actions/security-for-github-actions/security-guides/security-hardening-for-github-actions#using-third-party-actions',
				},
			],
		};

		return [ finding ];
	},
};

/**
 * Check whether an allowlist pattern lacks a full-length commit SHA.
 *
 * @param pattern - Allowlist pattern to inspect.
 * @returns       True when no full SHA is present.
 */
function isUnpinned(pattern: string): boolean {
	return !SHA_PINNED.test(pattern);
}
