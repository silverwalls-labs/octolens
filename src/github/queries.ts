/**
 * GitHub API query functions.
 *
 * Every exported `get*` function accepts an Octokit client, a
 * {@link CachedFetcher}, and a target (usually a {@link RepoRef}). Results
 * are cached per-scan so the same query is never issued twice.
 *
 * Error handling: 404s and non-rate-limited 403s are swallowed and return
 * safe defaults. Rate-limit 403s are always re-thrown.
 *
 * @module
 */
import type { Octokit } from '@octokit/rest';
import type { CachedFetcher, RepoRef } from '../types/index.ts';

/** SPDX licence information from repository metadata. */
export type RepoLicense = {
	spdxId: string | null;
};

/** Secret scanning feature status. */
export type SecretScanningStatus = {
	status?: string;
};

/** Security and analysis feature flags from the repo API. */
export type SecurityAndAnalysis = {
	secretScanning?: SecretScanningStatus;
	secretScanningPushProtection?: SecretScanningStatus;
};

/** Repository visibility level. */
export type RepoVisibility = 'public' | 'private' | 'internal';

/** Core repository metadata fetched from the repos API. */
export type RepoMetadata = {
	'defaultBranch': string;
	'license': RepoLicense | null;
	'securityAndAnalysis': SecurityAndAnalysis | null;
	'archived': boolean;
	'deleteBranchOnMerge': boolean;
	'private': boolean;
	'visibility': RepoVisibility;
	'allowForking': boolean;
	'description': string | null;
	'topics': string[];
};

/** Branch protection settings for a specific branch. */
export type BranchProtection = {
	exists: boolean;
	requiredPullRequest: boolean;
	requiredApprovingReviewCount: number;
	allowsForcePushes: boolean;
	requiredStatusCheckContexts: string[];
	dismissStaleReviews: boolean;
	requireConversationResolution: boolean;
	enforceAdmins: boolean;
	requireLinearHistory: boolean;
	requireCodeOwnerReviews: boolean;
	requireSignedCommits: boolean;
};

/** CODEOWNERS validation result. */
export type CodeownersErrors = {
	checked: boolean;
	errorCount: number;
};

/** Summary of a repository ruleset. */
export type RepoRulesetSummary = {
	id: number;
	name: string;
	enforcement: string;
	target: string;
};

/** A custom property value assigned to a repository. */
export type CustomPropertyValue = {
	propertyName: string;
	value: string | string[] | null;
};

/** Organisation-level custom property definition. */
export type CustomPropertyDefinition = {
	propertyName: string;
	required: boolean;
};

/** Whether the repository has code scanning analyses. */
export type CodeScanningStatus = {
	hasAnalyses: boolean;
};

/** Whether a SECURITY.md file exists in the repository. */
export type SecurityPolicyStatus = {
	present: boolean;
};

/** Normalised collaborator permission level. */
export type CollaboratorPermission = 'admin' | 'maintain' | 'write' | 'triage' | 'read';

/** A repository collaborator with their permission level. */
export type Collaborator = {
	login: string;
	permission: CollaboratorPermission;
};

/** Summary of a deployment environment's protection settings. */
export type EnvironmentSummary = {
	name: string;
	hasReviewers: boolean;
	hasBranchPolicy: boolean;
	hasWaitTimer: boolean;
};

/** Result of listing deployment environments. */
export type EnvironmentInventory = {
	checked: boolean;
	environments: EnvironmentSummary[];
};

/** Metadata for a repository secret (no value is exposed). */
export type SecretMetadata = {
	name: string;
	createdAt: string;
	updatedAt: string;
};

/** Which secret store a secret belongs to. */
export type SecretStore = 'actions' | 'dependabot' | 'codespaces';

/** Result of listing secrets from one store. */
export type SecretInventory = {
	store: SecretStore;
	checked: boolean;
	secrets: SecretMetadata[];
};

/** Private vulnerability reporting status. */
export type PrivateVulnerabilityReporting = {
	checked: boolean;
	enabled: boolean;
};

/** Summary of a self-hosted runner. */
export type RunnerSummary = {
	id: number;
	name: string;
	labels: string[];
};

/** Result of listing self-hosted runners. */
export type RunnerInventory = {
	checked: boolean;
	runners: RunnerSummary[];
};

/** Summary of a repository webhook. */
export type WebhookSummary = {
	id: number;
	url: string;
	insecureSsl: boolean;
};

/** Summary of a deploy key. */
export type DeployKeySummary = {
	id: number;
	title: string;
	readOnly: boolean;
};

/** Summary of a team with access to the repository. */
export type RepoTeamSummary = {
	slug: string;
	name: string;
	permission: string;
};

/** Result of listing teams with repository access. */
export type RepoTeamsResult = {
	checked: boolean;
	teams: RepoTeamSummary[];
};

/** Fetch core repository metadata (default branch, visibility, topics, etc.). */
export function getRepoMetadata(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<RepoMetadata> {
	return cache.fetch(
		`repo-metadata:${repo.owner}/${repo.name}`,
		() => fetchRepoMetadata(octokit, repo),
	);
}

/** Fetch branch protection rules. Returns an "all off" default on 404/403. */
export function getBranchProtection(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
	branch: string,
): Promise<BranchProtection> {
	return cache.fetch(
		`branch-protection:${repo.owner}/${repo.name}@${branch}`,
		() => fetchBranchProtection(octokit, repo, branch),
	);
}

/** Check whether the repository has any code scanning analyses. */
export function getCodeScanningStatus(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<CodeScanningStatus> {
	return cache.fetch(
		`code-scanning:${repo.owner}/${repo.name}`,
		() => fetchCodeScanningStatus(octokit, repo),
	);
}

/** Check for SECURITY.md in root, `.github/`, or `docs/`. */
export function getSecurityPolicyStatus(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<SecurityPolicyStatus> {
	return cache.fetch(
		`security-policy:${repo.owner}/${repo.name}`,
		() => fetchSecurityPolicyStatus(octokit, repo),
	);
}

/** Fetch CODEOWNERS validation errors. Returns `checked: false` if no file exists. */
export function getCodeownersErrors(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<CodeownersErrors> {
	return cache.fetch(
		`codeowners-errors:${repo.owner}/${repo.name}`,
		() => fetchCodeownersErrors(octokit, repo),
	);
}

/** Check for a CODEOWNERS file in root, `.github/`, or `docs/`. */
export function getCodeownersFilePresent(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<boolean> {
	return cache.fetch(
		`codeowners-present:${repo.owner}/${repo.name}`,
		() => fetchCodeownersFilePresent(octokit, repo),
	);
}

/** List repository rulesets. Returns `[]` on 404. */
export function getRepoRulesets(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<RepoRulesetSummary[]> {
	return cache.fetch(
		`rulesets:${repo.owner}/${repo.name}`,
		() => fetchRepoRulesets(octokit, repo),
	);
}

/** Fetch custom property values for a repository. Returns `null` if unavailable. */
export function getRepoCustomPropertyValues(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<CustomPropertyValue[] | null> {
	return cache.fetch(
		`repo-property-values:${repo.owner}/${repo.name}`,
		() => fetchRepoCustomPropertyValues(octokit, repo),
	);
}

/** Fetch the organisation-level custom property definitions. Returns `null` if unavailable. */
export function getOrgCustomPropertySchema(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<CustomPropertyDefinition[] | null> {
	return cache.fetch(
		`org-property-schema:${org}`,
		() => fetchOrgCustomPropertySchema(octokit, org),
	);
}

/**
 * Cache-key prefixes for org-scoped queries used by repo rules. During a
 * fleet scan these keys are routed to a shared parent cache so the data is
 * fetched once for the whole organisation instead of once per repository.
 */
export const ORG_SCOPED_CACHE_PREFIXES = [ 'org-property-schema:' ] as const;

/** GitHub Actions permission settings for a repository. */
export type ActionsPermissions = {
	enabled: boolean;
	allowedActions: 'all' | 'local_only' | 'selected' | null;
};

/** Default GITHUB_TOKEN permissions and PR approval setting. */
export type DefaultWorkflowPermissions = {
	defaultPermissions: 'read' | 'write' | null;
	canApprovePullRequestReviews: boolean;
};

/** Allowed GitHub Actions configuration when `allowed_actions` is `'selected'`. */
export type AllowedActionsConfig = {
	githubOwnedAllowed: boolean;
	verifiedAllowed: boolean;
	patternsAllowed: string[];
};

/** Fetch GitHub Actions permissions for a repository. */
export function getActionsPermissions(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<ActionsPermissions> {
	return cache.fetch(
		`actions-permissions:${repo.owner}/${repo.name}`,
		() => fetchActionsPermissions(octokit, repo),
	);
}

/** Fetch default GITHUB_TOKEN permissions for workflows. */
export function getDefaultWorkflowPermissions(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<DefaultWorkflowPermissions> {
	return cache.fetch(
		`default-workflow-permissions:${repo.owner}/${repo.name}`,
		() => fetchDefaultWorkflowPermissions(octokit, repo),
	);
}

/** Fetch allowed-actions configuration. Returns `null` on 404 or 409. */
export function getAllowedActions(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<AllowedActionsConfig | null> {
	return cache.fetch(
		`allowed-actions:${repo.owner}/${repo.name}`,
		() => fetchAllowedActions(octokit, repo),
	);
}

/** Check whether Dependabot security updates are enabled. */
export function getAutomatedSecurityFixesEnabled(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<boolean> {
	return cache.fetch(
		`automated-security-fixes:${repo.owner}/${repo.name}`,
		() => fetchAutomatedSecurityFixesEnabled(octokit, repo),
	);
}

/** List collaborators with direct access to the repository. */
export function getDirectCollaborators(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<Collaborator[]> {
	return cache.fetch(
		`collaborators-direct:${repo.owner}/${repo.name}`,
		() => fetchCollaborators(octokit, repo, 'direct'),
	);
}

/** List outside collaborators on the repository. */
export function getOutsideCollaborators(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<Collaborator[]> {
	return cache.fetch(
		`collaborators-outside:${repo.owner}/${repo.name}`,
		() => fetchCollaborators(octokit, repo, 'outside'),
	);
}

/** List deployment environments with their protection settings. */
export function getEnvironments(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<EnvironmentInventory> {
	return cache.fetch(
		`environments:${repo.owner}/${repo.name}`,
		() => fetchEnvironments(octokit, repo),
	);
}

/** Count the total number of branches in the repository. */
export function getBranchCount(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<number> {
	return cache.fetch(
		`branch-count:${repo.owner}/${repo.name}`,
		() => fetchBranchCount(octokit, repo),
	);
}

/** List GitHub Actions secrets (metadata only, no values). */
export function getActionsSecrets(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<SecretInventory> {
	return cache.fetch(
		`secrets-actions:${repo.owner}/${repo.name}`,
		() => fetchActionsSecrets(octokit, repo),
	);
}

/** List Dependabot secrets (metadata only, no values). */
export function getDependabotSecrets(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<SecretInventory> {
	return cache.fetch(
		`secrets-dependabot:${repo.owner}/${repo.name}`,
		() => fetchDependabotSecrets(octokit, repo),
	);
}

/** List Codespaces secrets (metadata only, no values). */
export function getCodespacesSecrets(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<SecretInventory> {
	return cache.fetch(
		`secrets-codespaces:${repo.owner}/${repo.name}`,
		() => fetchCodespacesSecrets(octokit, repo),
	);
}

/** Check whether private vulnerability reporting is enabled. */
export function getPrivateVulnerabilityReporting(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<PrivateVulnerabilityReporting> {
	return cache.fetch(
		`pvr:${repo.owner}/${repo.name}`,
		() => fetchPrivateVulnerabilityReporting(octokit, repo),
	);
}

/** List self-hosted runners registered on the repository. */
export function getRepoRunners(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<RunnerInventory> {
	return cache.fetch(
		`runners:${repo.owner}/${repo.name}`,
		() => fetchRepoRunners(octokit, repo),
	);
}

/** List repository webhooks with URL and SSL verification status. */
export function getRepoWebhooks(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<WebhookSummary[]> {
	return cache.fetch(
		`webhooks:${repo.owner}/${repo.name}`,
		() => fetchRepoWebhooks(octokit, repo),
	);
}

/** List deploy keys with their read-only status. */
export function getDeployKeys(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<DeployKeySummary[]> {
	return cache.fetch(
		`deploy-keys:${repo.owner}/${repo.name}`,
		() => fetchDeployKeys(octokit, repo),
	);
}

/** List teams with access to the repository and their permission levels. */
export function getRepoTeams(
	octokit: Octokit,
	cache: CachedFetcher,
	repo: RepoRef,
): Promise<RepoTeamsResult> {
	return cache.fetch(
		`repo-teams:${repo.owner}/${repo.name}`,
		() => fetchRepoTeams(octokit, repo),
	);
}

/**
 * Organisation settings from the orgs API.
 *
 * The privileged fields are only returned when the token belongs to an
 * organisation owner; for other tokens they are `undefined` (never a
 * default), so rules can skip instead of reporting a false pass/fail.
 */
export type OrgMetadata = {
	login: string;

	/** Public repository count (`null` when absent from the payload). */
	publicRepos: number | null;

	/** Private repository count visible to the token (`null` when absent). */
	totalPrivateRepos: number | null;
	twoFactorRequirementEnabled?: boolean;
	defaultRepositoryPermission?: string;
	membersCanCreatePublicRepositories?: boolean;
	membersCanForkPrivateRepositories?: boolean;
	membersCanChangeRepoVisibility?: boolean;
	membersCanDeleteRepositories?: boolean;
	membersCanInviteOutsideCollaborators?: boolean;
	membersCanDeleteIssues?: boolean;
	membersCanCreatePages?: boolean;
	membersCanCreatePublicPages?: boolean;
	webCommitSignoffRequired?: boolean;
	deployKeysEnabledForRepositories?: boolean;
	dependabotAlertsEnabledForNewRepos?: boolean;
	dependabotSecurityUpdatesEnabledForNewRepos?: boolean;
	secretScanningEnabledForNewRepos?: boolean;
	secretScanningPushProtectionEnabledForNewRepos?: boolean;
};

/** Organisation-level GitHub Actions permission settings. */
export type OrgActionsPermissions = {
	checked: boolean;
	enabledRepositories: 'all' | 'selected' | 'none' | null;
	allowedActions: 'all' | 'local_only' | 'selected' | null;
};

/** Organisation-level default GITHUB_TOKEN permissions and PR approval setting. */
export type OrgWorkflowPermissions = {
	checked: boolean;
	defaultPermissions: 'read' | 'write' | null;
	canApprovePullRequestReviews: boolean;
};

/** Result of listing organisation webhooks. */
export type OrgWebhookInventory = {
	checked: boolean;
	hooks: WebhookSummary[];
};

/** Organisation-level allowed-actions configuration (when `allowed_actions` is `'selected'`). */
export type OrgAllowedActions = {
	checked: boolean;
	githubOwnedAllowed: boolean;
	verifiedAllowed: boolean;
	patternsAllowed: string[];
};

/** Organisation policy for when fork PR workflows require maintainer approval. */
export type OrgForkPrApproval = {
	checked: boolean;
	approvalPolicy: string | null;
};

/** Organisation settings for fork PR workflows on private repositories. */
export type OrgPrivateForkPrWorkflows = {
	checked: boolean;
	runWorkflowsFromForkPullRequests: boolean;
	sendWriteTokensToWorkflows: boolean;
	sendSecretsAndVariables: boolean;
	requireApprovalForForkPrWorkflows: boolean;
};

/** Fetch organisation settings (2FA policy, member permissions, security defaults). */
export function getOrgMetadata(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgMetadata> {
	return cache.fetch(
		`org-metadata:${org}`,
		() => fetchOrgMetadata(octokit, org),
	);
}

/** Fetch organisation-level GitHub Actions permissions. Returns `checked: false` on 404/403. */
export function getOrgActionsPermissions(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgActionsPermissions> {
	return cache.fetch(
		`org-actions-permissions:${org}`,
		() => fetchOrgActionsPermissions(octokit, org),
	);
}

/** Fetch organisation-level default workflow permissions. Returns `checked: false` on 404/403. */
export function getOrgDefaultWorkflowPermissions(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgWorkflowPermissions> {
	return cache.fetch(
		`org-default-workflow-permissions:${org}`,
		() => fetchOrgDefaultWorkflowPermissions(octokit, org),
	);
}

/** List organisation webhooks. Returns `checked: false` on 404/403 (admin-only endpoint). */
export function getOrgWebhooks(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgWebhookInventory> {
	return cache.fetch(
		`org-webhooks:${org}`,
		() => fetchOrgWebhooks(octokit, org),
	);
}

/** Fetch the organisation allowed-actions configuration. Returns `checked: false` on 404/403/409. */
export function getOrgAllowedActions(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgAllowedActions> {
	return cache.fetch(
		`org-allowed-actions:${org}`,
		() => fetchOrgAllowedActions(octokit, org),
	);
}

/** Fetch the fork PR contributor approval policy. Returns `checked: false` on 404/403. */
export function getOrgForkPrApproval(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgForkPrApproval> {
	return cache.fetch(
		`org-fork-pr-approval:${org}`,
		() => fetchOrgForkPrApproval(octokit, org),
	);
}

/** Fetch fork PR workflow settings for private repos. Returns `checked: false` on 404/403. */
export function getOrgPrivateForkPrWorkflows(
	octokit: Octokit,
	cache: CachedFetcher,
	org: string,
): Promise<OrgPrivateForkPrWorkflows> {
	return cache.fetch(
		`org-private-fork-pr-workflows:${org}`,
		() => fetchOrgPrivateForkPrWorkflows(octokit, org),
	);
}

/** Minimal repository entry from the org repository listing. */
export type OrgRepoListing = {
	owner: string;
	name: string;
	archived: boolean;
	fork: boolean;
	visibility: RepoVisibility;
};

/**
 * Stream every repository of an organisation, one page at a time.
 *
 * Uses `paginate.iterator` so consumers can start scanning before the
 * full listing is fetched. Not cached — the listing is a one-shot stream.
 * Errors (including rate limits) propagate to the caller.
 *
 * @param octokit - Authenticated Octokit client.
 * @param org - Organisation login.
 */
export async function *listOrgRepos(
	octokit: Octokit,
	org: string,
): AsyncGenerator<OrgRepoListing> {
	const pages = octokit.paginate.iterator(octokit.rest.repos.listForOrg, {
		org,
		per_page: 100,
		type: 'all',
	});

	for await (const { data } of pages) {
		for (const repo of data) {
			yield {
				owner: repo.owner?.login ?? org,
				name: repo.name,
				archived: repo.archived === true,
				fork: repo.fork === true,
				visibility: toVisibility(repo.visibility, repo.private === true),
			};
		}
	}
}

async function fetchRepoMetadata(octokit: Octokit, repo: RepoRef): Promise<RepoMetadata> {
	const response = await octokit.rest.repos.get({
		owner: repo.owner,
		repo: repo.name,
	});
	const data = response.data;

	return {
		'defaultBranch': data.default_branch,
		'license': data.license ?
			{ spdxId: data.license.spdx_id ?? null } :
			null,
		'securityAndAnalysis': data.security_and_analysis ?
			{
				secretScanning: data.security_and_analysis.secret_scanning ?? undefined,
				secretScanningPushProtection:
					data.security_and_analysis.secret_scanning_push_protection ?? undefined,
			} :
			null,
		'archived': data.archived === true,
		'deleteBranchOnMerge': data.delete_branch_on_merge === true,
		'private': data.private === true,
		'visibility': toVisibility(data.visibility, data.private === true),
		'allowForking': data.allow_forking === true,
		'description': data.description ?? null,
		'topics': data.topics ?? [],
	};
}

function toVisibility(raw: string | undefined, isPrivate: boolean): RepoVisibility {
	if (raw === 'public' || raw === 'private' || raw === 'internal') {
		return raw;
	}

	return isPrivate ?
		'private' :
		'public';
}

async function fetchBranchProtection(
	octokit: Octokit,
	repo: RepoRef,
	branch: string,
): Promise<BranchProtection> {
	try {
		const response = await octokit.rest.repos.getBranchProtection({
			owner: repo.owner,
			repo: repo.name,
			branch,
		});
		const data = response.data;
		const prReview = data.required_pull_request_reviews;
		const allowsForce = data.allow_force_pushes?.enabled === true;
		const checks = data.required_status_checks?.contexts ?? [];

		return {
			exists: true,
			requiredPullRequest: Boolean(prReview),
			requiredApprovingReviewCount: prReview?.required_approving_review_count ?? 0,
			allowsForcePushes: allowsForce,
			requiredStatusCheckContexts: checks,
			dismissStaleReviews: prReview?.dismiss_stale_reviews === true,
			requireConversationResolution:
				data.required_conversation_resolution?.enabled === true,
			enforceAdmins: data.enforce_admins?.enabled === true,
			requireLinearHistory: data.required_linear_history?.enabled === true,
			requireCodeOwnerReviews: prReview?.require_code_owner_reviews === true,
			requireSignedCommits: data.required_signatures?.enabled === true,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				exists: false,
				requiredPullRequest: false,
				requiredApprovingReviewCount: 0,
				allowsForcePushes: true,
				requiredStatusCheckContexts: [],
				dismissStaleReviews: false,
				requireConversationResolution: false,
				enforceAdmins: false,
				requireLinearHistory: false,
				requireCodeOwnerReviews: false,
				requireSignedCommits: false,
			};
		}
		throw err;
	}
}

async function fetchCodeownersErrors(
	octokit: Octokit,
	repo: RepoRef,
): Promise<CodeownersErrors> {
	try {
		const response = await octokit.rest.repos.codeownersErrors({
			owner: repo.owner,
			repo: repo.name,
		});

		return {
			checked: true,
			errorCount: response.data.errors.length,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return { checked: false, errorCount: 0 };
		}
		throw err;
	}
}

async function fetchCodeownersFilePresent(
	octokit: Octokit,
	repo: RepoRef,
): Promise<boolean> {
	const candidates = [
		'CODEOWNERS',
		'.github/CODEOWNERS',
		'docs/CODEOWNERS',
	];

	for (const path of candidates) {
		const found = await getContentExists(octokit, repo, path);

		if (found) {
			return true;
		}
	}

	return false;
}

async function fetchRepoRulesets(
	octokit: Octokit,
	repo: RepoRef,
): Promise<RepoRulesetSummary[]> {
	try {
		const response = await octokit.rest.repos.getRepoRulesets({
			owner: repo.owner,
			repo: repo.name,
		});

		return response.data.map(toRulesetSummary);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return [];
		}
		throw err;
	}
}

async function fetchRepoCustomPropertyValues(
	octokit: Octokit,
	repo: RepoRef,
): Promise<CustomPropertyValue[] | null> {
	try {
		const response = await octokit.rest.repos.customPropertiesForReposGetRepositoryValues({
			owner: repo.owner,
			repo: repo.name,
		});

		return response.data.map(toPropertyValue);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return null;
		}
		throw err;
	}
}

async function fetchOrgCustomPropertySchema(
	octokit: Octokit,
	org: string,
): Promise<CustomPropertyDefinition[] | null> {
	try {
		const orgsApi = octokit.rest.orgs;
		const response = await orgsApi.customPropertiesForReposGetOrganizationDefinitions({ org });

		return response.data.map(toPropertyDefinition);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return null;
		}
		throw err;
	}
}

async function fetchOrgMetadata(octokit: Octokit, org: string): Promise<OrgMetadata> {
	const response = await octokit.rest.orgs.get({ org });
	const data = response.data;

	return {
		login: data.login,
		publicRepos: data.public_repos ?? null,
		totalPrivateRepos: data.total_private_repos ?? null,
		twoFactorRequirementEnabled: toOptionalBoolean(data.two_factor_requirement_enabled),
		defaultRepositoryPermission: data.default_repository_permission ?? undefined,
		membersCanCreatePublicRepositories:
			toOptionalBoolean(data.members_can_create_public_repositories),
		membersCanForkPrivateRepositories:
			toOptionalBoolean(data.members_can_fork_private_repositories),
		membersCanChangeRepoVisibility:
			toOptionalBoolean(data.members_can_change_repo_visibility),
		membersCanDeleteRepositories:
			toOptionalBoolean(data.members_can_delete_repositories),
		membersCanInviteOutsideCollaborators:
			toOptionalBoolean(data.members_can_invite_outside_collaborators),
		membersCanDeleteIssues: toOptionalBoolean(data.members_can_delete_issues),
		membersCanCreatePages: toOptionalBoolean(data.members_can_create_pages),
		membersCanCreatePublicPages: toOptionalBoolean(data.members_can_create_public_pages),
		webCommitSignoffRequired: toOptionalBoolean(data.web_commit_signoff_required),
		deployKeysEnabledForRepositories:
			toOptionalBoolean(data.deploy_keys_enabled_for_repositories),
		dependabotAlertsEnabledForNewRepos:
			toOptionalBoolean(data.dependabot_alerts_enabled_for_new_repositories),
		dependabotSecurityUpdatesEnabledForNewRepos:
			toOptionalBoolean(data.dependabot_security_updates_enabled_for_new_repositories),
		secretScanningEnabledForNewRepos:
			toOptionalBoolean(data.secret_scanning_enabled_for_new_repositories),
		secretScanningPushProtectionEnabledForNewRepos:
			toOptionalBoolean(data.secret_scanning_push_protection_enabled_for_new_repositories),
	};
}

function toOptionalBoolean(value: boolean | null | undefined): boolean | undefined {
	return typeof value === 'boolean' ?
		value :
		undefined;
}

async function fetchOrgActionsPermissions(
	octokit: Octokit,
	org: string,
): Promise<OrgActionsPermissions> {
	try {
		const actionsApi = octokit.rest.actions;
		const response = await actionsApi.getGithubActionsPermissionsOrganization({ org });

		return {
			checked: true,
			enabledRepositories: response.data.enabled_repositories ?? null,
			allowedActions: response.data.allowed_actions ?? null,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				checked: false, enabledRepositories: null, allowedActions: null,
			};
		}
		throw err;
	}
}

async function fetchOrgDefaultWorkflowPermissions(
	octokit: Octokit,
	org: string,
): Promise<OrgWorkflowPermissions> {
	try {
		const actionsApi = octokit.rest.actions;
		const response = await actionsApi.getGithubActionsDefaultWorkflowPermissionsOrganization({
			org,
		});

		return {
			checked: true,
			defaultPermissions: response.data.default_workflow_permissions ?? null,
			canApprovePullRequestReviews: response.data.can_approve_pull_request_reviews === true,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				checked: false,
				defaultPermissions: null,
				canApprovePullRequestReviews: false,
			};
		}
		throw err;
	}
}

async function fetchOrgAllowedActions(
	octokit: Octokit,
	org: string,
): Promise<OrgAllowedActions> {
	try {
		const response = await octokit.rest.actions.getAllowedActionsOrganization({ org });

		return {
			checked: true,
			githubOwnedAllowed: response.data.github_owned_allowed === true,
			verifiedAllowed: response.data.verified_allowed === true,
			patternsAllowed: response.data.patterns_allowed ?? [],
		};
	} catch (err: unknown) {
		// 409: allowed-actions config does not apply (policy is not 'selected').
		if (isHttpStatus(err, 404) || isHttpStatus(err, 409) || isForbiddenNotRateLimited(err)) {
			return {
				checked: false,
				githubOwnedAllowed: false,
				verifiedAllowed: false,
				patternsAllowed: [],
			};
		}
		throw err;
	}
}

async function fetchOrgForkPrApproval(
	octokit: Octokit,
	org: string,
): Promise<OrgForkPrApproval> {
	try {
		const response = await octokit.request(
			'GET /orgs/{org}/actions/permissions/fork-pr-contributor-approval',
			{ org },
		);
		const data = response.data as { approval_policy?: string; };

		return { checked: true, approvalPolicy: data.approval_policy ?? null };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, approvalPolicy: null };
		}
		throw err;
	}
}

type RawPrivateForkPrWorkflows = {
	run_workflows_from_fork_pull_requests?: boolean;
	send_write_tokens_to_workflows?: boolean;
	send_secrets_and_variables?: boolean;
	require_approval_for_fork_pr_workflows?: boolean;
};

async function fetchOrgPrivateForkPrWorkflows(
	octokit: Octokit,
	org: string,
): Promise<OrgPrivateForkPrWorkflows> {
	try {
		const response = await octokit.request(
			'GET /orgs/{org}/actions/permissions/fork-pr-workflows-private-repos',
			{ org },
		);
		const data = response.data as RawPrivateForkPrWorkflows;

		return {
			checked: true,
			runWorkflowsFromForkPullRequests: data.run_workflows_from_fork_pull_requests === true,
			sendWriteTokensToWorkflows: data.send_write_tokens_to_workflows === true,
			sendSecretsAndVariables: data.send_secrets_and_variables === true,
			requireApprovalForForkPrWorkflows: data.require_approval_for_fork_pr_workflows === true,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				checked: false,
				runWorkflowsFromForkPullRequests: false,
				sendWriteTokensToWorkflows: false,
				sendSecretsAndVariables: false,
				requireApprovalForForkPrWorkflows: false,
			};
		}
		throw err;
	}
}

async function fetchOrgWebhooks(octokit: Octokit, org: string): Promise<OrgWebhookInventory> {
	try {
		const data = await octokit.paginate(octokit.rest.orgs.listWebhooks, {
			org,
			per_page: 100,
		});

		return { checked: true, hooks: data.map(toWebhookSummary) };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, hooks: [] };
		}
		throw err;
	}
}

async function fetchCodeScanningStatus(
	octokit: Octokit,
	repo: RepoRef,
): Promise<CodeScanningStatus> {
	try {
		const response = await octokit.rest.codeScanning.listRecentAnalyses({
			owner: repo.owner,
			repo: repo.name,
			per_page: 1,
		});

		return { hasAnalyses: response.data.length > 0 };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { hasAnalyses: false };
		}
		throw err;
	}
}

async function fetchSecurityPolicyStatus(
	octokit: Octokit,
	repo: RepoRef,
): Promise<SecurityPolicyStatus> {
	const candidates = [
		'SECURITY.md',
		'.github/SECURITY.md',
		'docs/SECURITY.md',
	];

	for (const path of candidates) {
		const found = await getContentExists(octokit, repo, path);

		if (found) {
			return { present: true };
		}
	}

	return { present: false };
}

async function getContentExists(octokit: Octokit, repo: RepoRef, path: string): Promise<boolean> {
	try {
		await octokit.rest.repos.getContent({
			owner: repo.owner,
			repo: repo.name,
			path,
		});

		return true;
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return false;
		}
		throw err;
	}
}

async function fetchActionsPermissions(
	octokit: Octokit,
	repo: RepoRef,
): Promise<ActionsPermissions> {
	try {
		const response = await octokit.rest.actions.getGithubActionsPermissionsRepository({
			owner: repo.owner,
			repo: repo.name,
		});

		return {
			enabled: response.data.enabled === true,
			allowedActions: response.data.allowed_actions ?? null,
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return { enabled: false, allowedActions: null };
		}
		throw err;
	}
}

async function fetchDefaultWorkflowPermissions(
	octokit: Octokit,
	repo: RepoRef,
): Promise<DefaultWorkflowPermissions> {
	const actionsApi = octokit.rest.actions;
	const response = await actionsApi.getGithubActionsDefaultWorkflowPermissionsRepository({
		owner: repo.owner,
		repo: repo.name,
	});

	return {
		defaultPermissions: response.data.default_workflow_permissions ?? null,
		canApprovePullRequestReviews: response.data.can_approve_pull_request_reviews === true,
	};
}

async function fetchAllowedActions(
	octokit: Octokit,
	repo: RepoRef,
): Promise<AllowedActionsConfig | null> {
	try {
		const response = await octokit.rest.actions.getAllowedActionsRepository({
			owner: repo.owner,
			repo: repo.name,
		});

		return {
			githubOwnedAllowed: response.data.github_owned_allowed === true,
			verifiedAllowed: response.data.verified_allowed === true,
			patternsAllowed: response.data.patterns_allowed ?? [],
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isHttpStatus(err, 409)) {
			return null;
		}
		throw err;
	}
}

async function fetchAutomatedSecurityFixesEnabled(
	octokit: Octokit,
	repo: RepoRef,
): Promise<boolean> {
	try {
		const response = await octokit.rest.repos.checkAutomatedSecurityFixes({
			owner: repo.owner,
			repo: repo.name,
		});

		return response.data.enabled === true;
	} catch (err: unknown) {
		if (isHttpStatus(err, 404)) {
			return false;
		}
		throw err;
	}
}

async function fetchCollaborators(
	octokit: Octokit,
	repo: RepoRef,
	affiliation: 'direct' | 'outside',
): Promise<Collaborator[]> {
	try {
		const data = await octokit.paginate(octokit.rest.repos.listCollaborators, {
			owner: repo.owner,
			repo: repo.name,
			affiliation,
			per_page: 100,
		});

		return data.map(toCollaborator);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return [];
		}
		throw err;
	}
}

async function fetchEnvironments(
	octokit: Octokit,
	repo: RepoRef,
): Promise<EnvironmentInventory> {
	try {
		const response = await octokit.rest.repos.getAllEnvironments({
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});
		const list = response.data.environments ?? [];

		return {
			checked: true,
			environments: list.map(toEnvironmentSummary),
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, environments: [] };
		}
		throw err;
	}
}

async function fetchBranchCount(octokit: Octokit, repo: RepoRef): Promise<number> {
	const data = await octokit.paginate(octokit.rest.repos.listBranches, {
		owner: repo.owner,
		repo: repo.name,
		per_page: 100,
	});

	return data.length;
}

async function fetchActionsSecrets(octokit: Octokit, repo: RepoRef): Promise<SecretInventory> {
	try {
		const data = await octokit.paginate(octokit.rest.actions.listRepoSecrets, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return {
			store: 'actions',
			checked: true,
			secrets: data.map(toSecretMetadata),
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				store: 'actions',
				checked: false,
				secrets: [],
			};
		}
		throw err;
	}
}

async function fetchDependabotSecrets(octokit: Octokit, repo: RepoRef): Promise<SecretInventory> {
	try {
		const data = await octokit.paginate(octokit.rest.dependabot.listRepoSecrets, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return {
			store: 'dependabot',
			checked: true,
			secrets: data.map(toSecretMetadata),
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				store: 'dependabot',
				checked: false,
				secrets: [],
			};
		}
		throw err;
	}
}

async function fetchCodespacesSecrets(octokit: Octokit, repo: RepoRef): Promise<SecretInventory> {
	try {
		const data = await octokit.paginate(octokit.rest.codespaces.listRepoSecrets, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return {
			store: 'codespaces',
			checked: true,
			secrets: data.map(toSecretMetadata),
		};
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return {
				store: 'codespaces',
				checked: false,
				secrets: [],
			};
		}
		throw err;
	}
}

type RawSecret = {
	name: string;
	created_at: string;
	updated_at: string;
};

function toSecretMetadata(raw: RawSecret): SecretMetadata {
	return {
		name: raw.name,
		createdAt: raw.created_at,
		updatedAt: raw.updated_at,
	};
}

async function fetchPrivateVulnerabilityReporting(
	octokit: Octokit,
	repo: RepoRef,
): Promise<PrivateVulnerabilityReporting> {
	try {
		const response = await octokit.request(
			'GET /repos/{owner}/{repo}/private-vulnerability-reporting',
			{ owner: repo.owner, repo: repo.name },
		);
		const data = response.data as { enabled?: boolean; };

		return { checked: true, enabled: data.enabled === true };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, enabled: false };
		}
		throw err;
	}
}

async function fetchRepoRunners(octokit: Octokit, repo: RepoRef): Promise<RunnerInventory> {
	try {
		const data = await octokit.paginate(octokit.rest.actions.listSelfHostedRunnersForRepo, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return { checked: true, runners: data.map(toRunnerSummary) };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, runners: [] };
		}
		throw err;
	}
}

async function fetchRepoWebhooks(octokit: Octokit, repo: RepoRef): Promise<WebhookSummary[]> {
	try {
		const data = await octokit.paginate(octokit.rest.repos.listWebhooks, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return data.map(toWebhookSummary);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return [];
		}
		throw err;
	}
}

async function fetchDeployKeys(octokit: Octokit, repo: RepoRef): Promise<DeployKeySummary[]> {
	try {
		const data = await octokit.paginate(octokit.rest.repos.listDeployKeys, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return data.map(toDeployKeySummary);
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return [];
		}
		throw err;
	}
}

async function fetchRepoTeams(octokit: Octokit, repo: RepoRef): Promise<RepoTeamsResult> {
	try {
		const data = await octokit.paginate(octokit.rest.repos.listTeams, {
			owner: repo.owner,
			repo: repo.name,
			per_page: 100,
		});

		return { checked: true, teams: data.map(toRepoTeamSummary) };
	} catch (err: unknown) {
		if (isHttpStatus(err, 404) || isForbiddenNotRateLimited(err)) {
			return { checked: false, teams: [] };
		}
		throw err;
	}
}

type RawRunner = {
	id: number;
	name: string;
	labels?: { name: string; }[];
};

function toRunnerSummary(raw: RawRunner): RunnerSummary {
	return {
		id: raw.id,
		name: raw.name,
		labels: (raw.labels ?? []).map(labelName),
	};
}

function labelName(label: { name: string; }): string {
	return label.name;
}

type RawWebhook = {
	id: number;
	config?: {
		url?: string;
		insecure_ssl?: string | number;
	};
};

function toWebhookSummary(raw: RawWebhook): WebhookSummary {
	const cfg = raw.config ?? {};

	return {
		id: raw.id,
		url: cfg.url ?? '',
		insecureSsl: parseInsecureSsl(cfg.insecure_ssl),
	};
}

function parseInsecureSsl(value: string | number | undefined): boolean {
	if (typeof value === 'string') {
		return value === '1' || value.toLowerCase() === 'true';
	}

	return value === 1;
}

type RawDeployKey = {
	id: number;
	title: string;
	read_only?: boolean;
};

function toDeployKeySummary(raw: RawDeployKey): DeployKeySummary {
	return {
		id: raw.id,
		title: raw.title,
		readOnly: raw.read_only === true,
	};
}

type RawRepoTeam = {
	slug: string;
	name: string;
	permission?: string;
};

function toRepoTeamSummary(raw: RawRepoTeam): RepoTeamSummary {
	return {
		slug: raw.slug,
		name: raw.name,
		permission: raw.permission ?? 'pull',
	};
}

type RawRuleset = {
	id: number;
	name: string;
	enforcement: string;
	target?: string;
};

function toRulesetSummary(raw: RawRuleset): RepoRulesetSummary {
	return {
		id: raw.id,
		name: raw.name,
		enforcement: raw.enforcement,
		target: raw.target ?? 'branch',
	};
}

type RawPropertyValue = {
	property_name: string;
	value: string | string[] | null;
};

function toPropertyValue(raw: RawPropertyValue): CustomPropertyValue {
	return {
		propertyName: raw.property_name,
		value: raw.value,
	};
}

type RawPropertyDefinition = {
	property_name: string;
	required?: boolean | null;
};

function toPropertyDefinition(raw: RawPropertyDefinition): CustomPropertyDefinition {
	return {
		propertyName: raw.property_name,
		required: raw.required === true,
	};
}

type RawCollaborator = {
	login: string;
	role_name?: string;
	permissions?: {
		admin?: boolean;
		maintain?: boolean;
		push?: boolean;
		triage?: boolean;
		pull?: boolean;
	};
};

function toCollaborator(raw: RawCollaborator): Collaborator {
	return {
		login: raw.login,
		permission: derivePermission(raw),
	};
}

function derivePermission(raw: RawCollaborator): CollaboratorPermission {
	const role = raw.role_name?.toLowerCase();

	if (role === 'admin' || role === 'maintain' || role === 'triage' || role === 'read') {
		return role;
	}

	if (role === 'write') {
		return 'write';
	}

	const perms = raw.permissions ?? {};

	if (perms.admin) {
		return 'admin';
	}
	if (perms.maintain) {
		return 'maintain';
	}
	if (perms.push) {
		return 'write';
	}
	if (perms.triage) {
		return 'triage';
	}

	return 'read';
}

type RawProtectionRule = {
	type: string;
	reviewers?: unknown;
	wait_timer?: number;
};

type RawEnvironment = {
	name: string;
	protection_rules?: RawProtectionRule[];
	deployment_branch_policy?: unknown;
};

function toEnvironmentSummary(raw: RawEnvironment): EnvironmentSummary {
	const rules = raw.protection_rules ?? [];

	return {
		name: raw.name,
		hasReviewers: rules.some(isReviewerRule),
		hasWaitTimer: rules.some(isWaitTimerRule),
		hasBranchPolicy: raw.deployment_branch_policy !== null &&
			raw.deployment_branch_policy !== undefined,
	};
}

function isReviewerRule(rule: { type: string; }): boolean {
	return rule.type === 'required_reviewers';
}

function isWaitTimerRule(rule: { type: string; wait_timer?: number; }): boolean {
	return rule.type === 'wait_timer' && (rule.wait_timer ?? 0) > 0;
}

type WithStatus = {
	status: unknown;
};

function isHttpStatus(err: unknown, status: number): boolean {
	return typeof err === 'object' &&
		err !== null &&
		'status' in err &&
		(err as WithStatus).status === status;
}

type ErrorResponse = {
	response?: {
		headers?: Record<string, string | undefined>;
	};
	message?: unknown;
};

/*
 * A 403 can mean two very different things: the token lacks permission (a
 * benign "not configured" we swallow), or we have been rate-limited (which we
 * must NOT swallow — that would silently turn a throttled request into a clean
 * pass and hide a finding). Distinguish them by the rate-limit signals GitHub
 * attaches to the response.
 */
function isRateLimited(err: unknown): boolean {
	if (isHttpStatus(err, 429)) {
		return true;
	}
	if (!isHttpStatus(err, 403)) {
		return false;
	}

	const headers = (err as ErrorResponse).response?.headers ?? {};
	const remaining = headers['x-ratelimit-remaining'];

	if (remaining === '0' || headers['retry-after'] !== undefined) {
		return true;
	}

	const message = (err as ErrorResponse).message;

	if (typeof message !== 'string') {
		return false;
	}

	const lower = message.toLowerCase();

	return lower.includes('rate limit') ||
		lower.includes('secondary rate') ||
		lower.includes('abuse');
}

/*
 * True only for a genuine permission-denied 403 — a rate-limit 403 returns
 * false here so it propagates as a visible error instead of a silent skip.
 */
function isForbiddenNotRateLimited(err: unknown): boolean {
	return isHttpStatus(err, 403) && !isRateLimited(err);
}
