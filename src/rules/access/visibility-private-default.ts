import { getRepoMetadata } from '../../github/queries.ts';
import type { RepoVisibility } from '../../github/queries.ts';
import type {
	Finding, RepoRef, Rule, RuleContext,
} from '../../types/index.ts';

const RULE_ID = 'access/visibility-private-default';

export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Repositories should be private unless explicitly approved',
	docs: RULE_ID,

	async check(ctx) {
		const meta = await getRepoMetadata(ctx.octokit, ctx.cache, ctx.repo);

		if (meta.visibility === 'private') {
			return [];
		}

		const config = readConfig(ctx);

		if (isAllowed(ctx.repo, meta.visibility, config)) {
			return [];
		}

		return [ buildFinding(ctx.repo, meta.visibility) ];
	},
};

type VisibilityConfig = {
	allowPublic: string[];
	allowInternal: string[];
};

function readConfig(ctx: RuleContext): VisibilityConfig {
	const raw = ctx.ruleConfig[RULE_ID] as Partial<VisibilityConfig> | undefined;

	return {
		allowPublic: raw?.allowPublic ?? [],
		allowInternal: raw?.allowInternal ?? [],
	};
}

function isAllowed(repo: RepoRef, visibility: RepoVisibility, config: VisibilityConfig): boolean {
	const slug = `${repo.owner}/${repo.name}`.toLowerCase();

	// check() returns early for private repos, so only public/internal reach here.
	return visibility === 'public' ?
		config.allowPublic.includes(slug) :
		config.allowInternal.includes(slug);
}

function buildFinding(repo: RepoRef, visibility: RepoVisibility): Finding {
	if (visibility === 'public') {
		return {
			ruleId: RULE_ID,
			severity: 'medium',
			repo,
			title: 'Repository is public and not on the allow-public list',
			detail: 'This repository is publicly visible. Public repos expose source, ' +
				'history, issues, and metadata to the entire internet, and any leaked ' +
				'secret in git history is immediately compromised.',
			remediation: 'Settings -> General -> Danger Zone -> Change visibility -> ' +
				'Private. If the repository is intentionally public (OSS, docs, marketing), ' +
				'add it to the allow-public list (--allow-public ' +
				`${repo.owner}/${repo.name}).`,
		};
	}

	return {
		ruleId: RULE_ID,
		severity: 'medium',
		repo,
		title: 'Repository is internal and not on the allow-internal list',
		detail: 'This repository is internal (visible to all enterprise members). ' +
			'Internal visibility is a deliberate trust boundary; repos should be on the ' +
			'allow-internal list to confirm that scope was intended.',
		remediation: 'Settings -> General -> Danger Zone -> Change visibility -> ' +
			'Private if internal access is not required. Otherwise, add the repo to the ' +
			`allow-internal list (--allow-internal ${repo.owner}/${repo.name}).`,
	};
}
