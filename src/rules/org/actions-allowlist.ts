import { getOrgActionsPermissions } from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, OrgRule } from '../../types/index.ts';

const RULE_ID = 'org/actions-allowlist';

const DETAIL = 'The organisation allows workflows to use any action from the ' +
	'marketplace. A malicious or hijacked third-party action runs with access ' +
	'to repository contents and secrets in every repo that uses it.';

const REMEDIATION = 'Organization Settings -> Actions -> General -> Policies: ' +
	'select "Allow <org>, and select non-<org>, actions and reusable workflows" ' +
	'and allowlist the actions you trust (GitHub-owned, verified creators, or ' +
	'pinned patterns).';

export const rule: OrgRule = {
	id: RULE_ID,
	category: 'org',
	defaultSeverity: 'medium',
	summary: 'Organisation must restrict which actions workflows can use',
	docs: RULE_ID,

	async check(ctx) {
		const perms = await getOrgActionsPermissions(ctx.octokit, ctx.cache, ctx.org);

		if (!perms.checked) {
			return skip('could not read organisation Actions permissions (no permission)');
		}

		if (perms.enabledRepositories === 'none') {
			return [];
		}

		if (perms.allowedActions !== 'all') {
			return [];
		}

		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			org: ctx.org,
			title: 'All marketplace actions are allowed organisation-wide',
			detail: DETAIL,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Disabling or limiting GitHub Actions for your organization',
					url: 'https://docs.github.com/en/organizations/managing-organization-settings/disabling-or-limiting-github-actions-for-your-organization',
				},
			],
		};

		return [ finding ];
	},
};
