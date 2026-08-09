import {
	getRepoMetadata,
	getRepoRunners,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'cicd/forbid-self-hosted-runners-on-public-repos';

const DETAIL = 'Self-hosted runners are attached to this public repository. ' +
	'A pull request from a fork can run arbitrary code on those runners and inherit ' +
	'their network and filesystem access — a known supply-chain risk.';

const REMEDIATION = 'For public repos, prefer GitHub-hosted runners. If self-hosted ' +
	'is required, host them inside an organization-level runner group restricted to ' +
	'private repositories, or require explicit approval for fork pull requests.';

export const rule: Rule = {
	id: RULE_ID,
	category: 'cicd',
	defaultSeverity: 'high',
	summary: 'Public repositories must not use self-hosted runners',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.private) {
			return [];
		}

		const inventory = await getRepoRunners(ctx.octokit, ctx.cache, ctx.repo);

		if (!inventory.checked) {
			return skip('could not list self-hosted runners (no permission)');
		}

		if (inventory.runners.length === 0) {
			return [];
		}

		const names = inventory.runners.map(nameOf).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'high',
			repo: ctx.repo,
			title: `Public repository has ${inventory.runners.length} self-hosted runner(s)`,
			detail: `${DETAIL} Attached runners: ${names}.`,
			remediation: REMEDIATION,
			references: [
				{
					name: 'Self-hosted runner security',
					url: 'https://docs.github.com/en/actions/hosting-your-own-runners/managing-self-hosted-runners/about-self-hosted-runners#self-hosted-runner-security',
				},
			],
		};

		return [ finding ];
	},
};

function nameOf(runner: { name: string; }): string {
	return runner.name;
}
