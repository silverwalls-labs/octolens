export type RepoFixtureOptions = {
	'defaultBranch'?: string;
	'licenseSpdx'?: string | null;
	'hasLicense'?: boolean;
	'secretScanning'?: 'enabled' | 'disabled' | 'absent';
	'secretScanningPushProtection'?: 'enabled' | 'disabled';
	'deleteBranchOnMerge'?: boolean;
	'private'?: boolean;
	'visibility'?: 'public' | 'private' | 'internal';
	'allowForking'?: boolean;
	'description'?: string | null;
	'topics'?: string[];
};

export function makeRepoResponse(options: RepoFixtureOptions = {}): Record<string, unknown> {
	const license = options.hasLicense === false ?
		null :
		{
			key: 'mit',
			name: 'MIT License',
			spdx_id: options.licenseSpdx ?? 'MIT',
			url: 'https://api.github.com/licenses/mit',
		};

	const security: Record<string, unknown> = {};

	if (options.secretScanning === 'enabled') {
		security.secret_scanning = { status: 'enabled' };
	}
	if (options.secretScanning === 'disabled') {
		security.secret_scanning = { status: 'disabled' };
	}
	if (options.secretScanningPushProtection === 'enabled') {
		security.secret_scanning_push_protection = { status: 'enabled' };
	}
	if (options.secretScanningPushProtection === 'disabled') {
		security.secret_scanning_push_protection = { status: 'disabled' };
	}

	const visibility = options.visibility ?? 'public';

	return {
		'name': 'Octolens',
		'full_name': 'sheplu/Octolens',
		'owner': { login: 'sheplu' },
		'default_branch': options.defaultBranch ?? 'main',
		license,
		'security_and_analysis': options.secretScanning === 'absent' ?
			null :
			security,
		'delete_branch_on_merge': options.deleteBranchOnMerge ?? false,
		'private': options.private ?? visibility !== 'public',
		visibility,
		'allow_forking': options.allowForking ?? false,
		'description': 'description' in options ?
			options.description :
			'A test fixture repository',
		'topics': options.topics ?? [ 'security', 'github' ],
	};
}

export type ProtectionFixtureOptions = {
	requirePullRequest?: boolean;
	requiredApprovingReviewCount?: number;
	allowForcePushes?: boolean;
	statusCheckContexts?: string[];
	dismissStaleReviews?: boolean;
	requireConversationResolution?: boolean;
	enforceAdmins?: boolean;
	requireLinearHistory?: boolean;
	requireCodeOwnerReviews?: boolean;
	requireSignedCommits?: boolean;
};

type ProtectionResponse = Record<string, unknown>;

type BPOpts = ProtectionFixtureOptions;

export function makeBranchProtectionResponse(options: BPOpts = {}): ProtectionResponse {
	const body: Record<string, unknown> = {
		url: 'https://api.github.com/repos/sheplu/Octolens/branches/main/protection',
		allow_force_pushes: { enabled: options.allowForcePushes ?? false },
		enforce_admins: { enabled: options.enforceAdmins ?? false },
		required_conversation_resolution: {
			enabled: options.requireConversationResolution ?? false,
		},
		required_linear_history: { enabled: options.requireLinearHistory ?? false },
		required_signatures: { enabled: options.requireSignedCommits ?? false },
	};

	if (options.requirePullRequest) {
		body.required_pull_request_reviews = {
			required_approving_review_count: options.requiredApprovingReviewCount ?? 1,
			dismiss_stale_reviews: options.dismissStaleReviews ?? false,
			require_code_owner_reviews: options.requireCodeOwnerReviews ?? false,
		};
	}

	if (options.statusCheckContexts && options.statusCheckContexts.length > 0) {
		body.required_status_checks = {
			strict: true,
			contexts: options.statusCheckContexts,
		};
	}

	return body;
}

export type RulesetFixture = {
	id: number;
	name: string;
	target: string;
	enforcement: string;
};

export function makeRulesetsResponse(rulesets: RulesetFixture[]): RulesetFixture[] {
	return rulesets;
}

export type PropertyDefFixture = {
	property_name: string;
	required?: boolean;
};

export function makeOrgPropertySchema(defs: PropertyDefFixture[]): PropertyDefFixture[] {
	return defs;
}

export type PropertyValueFixture = {
	property_name: string;
	value: string | string[] | null;
};

export function makeRepoPropertyValues(values: PropertyValueFixture[]): PropertyValueFixture[] {
	return values;
}

export type OrgFixtureOptions = {
	/**
	 * When `false`, models the non-owner-token view: the privileged fields
	 * are omitted entirely (not `false`).
	 */
	privileged?: boolean;
	twoFactorRequirementEnabled?: boolean | null;
	defaultRepositoryPermission?: string | null;
	membersCanCreatePublicRepositories?: boolean;
	membersCanForkPrivateRepositories?: boolean | null;
	membersCanChangeRepoVisibility?: boolean;
	membersCanDeleteRepositories?: boolean;
	membersCanInviteOutsideCollaborators?: boolean;
	membersCanDeleteIssues?: boolean;
	membersCanCreatePages?: boolean;
	membersCanCreatePublicPages?: boolean;
	webCommitSignoffRequired?: boolean;
	deployKeysEnabledForRepositories?: boolean;
	dependabotAlertsEnabledForNewRepositories?: boolean;
	dependabotSecurityUpdatesEnabledForNewRepositories?: boolean;
	secretScanningEnabledForNewRepositories?: boolean;
	secretScanningPushProtectionEnabledForNewRepositories?: boolean;
};

export function makeOrgResponse(options: OrgFixtureOptions = {}): Record<string, unknown> {
	const body: Record<string, unknown> = {
		login: 'silverwalls-labs',
		id: 1,
		description: 'A test fixture organisation',
	};

	if (options.privileged === false) {
		return body;
	}

	/*
	 * `?? ` would coerce an explicit `null` (allowed by the API schema) into
	 * the default, so nullable fields check for `undefined` explicitly.
	 */
	return {
		...body,
		two_factor_requirement_enabled: orDefault(options.twoFactorRequirementEnabled, true),
		default_repository_permission: orDefault(options.defaultRepositoryPermission, 'read'),
		members_can_create_public_repositories:
			options.membersCanCreatePublicRepositories ?? false,
		members_can_fork_private_repositories:
			orDefault(options.membersCanForkPrivateRepositories, false),
		members_can_change_repo_visibility: options.membersCanChangeRepoVisibility ?? false,
		members_can_delete_repositories: options.membersCanDeleteRepositories ?? false,
		members_can_invite_outside_collaborators:
			options.membersCanInviteOutsideCollaborators ?? false,
		members_can_delete_issues: options.membersCanDeleteIssues ?? false,
		members_can_create_pages: options.membersCanCreatePages ?? true,
		members_can_create_public_pages: options.membersCanCreatePublicPages ?? false,
		web_commit_signoff_required: options.webCommitSignoffRequired ?? true,
		deploy_keys_enabled_for_repositories:
			options.deployKeysEnabledForRepositories ?? false,
		dependabot_alerts_enabled_for_new_repositories:
			options.dependabotAlertsEnabledForNewRepositories ?? true,
		dependabot_security_updates_enabled_for_new_repositories:
			options.dependabotSecurityUpdatesEnabledForNewRepositories ?? true,
		secret_scanning_enabled_for_new_repositories:
			options.secretScanningEnabledForNewRepositories ?? true,
		secret_scanning_push_protection_enabled_for_new_repositories:
			options.secretScanningPushProtectionEnabledForNewRepositories ?? true,
	};
}

function orDefault<T>(value: T | undefined, fallback: T): T {
	return value === undefined ?
		fallback :
		value;
}

type OrgBody = Record<string, unknown>;

export type OrgActionsPermissionsFixtureOptions = {
	enabledRepositories?: 'all' | 'selected' | 'none';
	allowedActions?: 'all' | 'local_only' | 'selected';
};

type OrgActionsOpts = OrgActionsPermissionsFixtureOptions;

export function makeOrgActionsPermissionsResponse(options: OrgActionsOpts = {}): OrgBody {
	return {
		enabled_repositories: options.enabledRepositories ?? 'all',
		allowed_actions: options.allowedActions ?? 'selected',
	};
}

export type OrgWorkflowPermissionsFixtureOptions = {
	defaultWorkflowPermissions?: 'read' | 'write';
	canApprovePullRequestReviews?: boolean;
};

type OrgWorkflowOpts = OrgWorkflowPermissionsFixtureOptions;

export function makeOrgWorkflowPermissionsResponse(options: OrgWorkflowOpts = {}): OrgBody {
	return {
		default_workflow_permissions: options.defaultWorkflowPermissions ?? 'read',
		can_approve_pull_request_reviews: options.canApprovePullRequestReviews ?? false,
	};
}

export type OrgAllowedActionsFixtureOptions = {
	githubOwnedAllowed?: boolean;
	verifiedAllowed?: boolean;
	patternsAllowed?: string[];
};

type OrgAllowedOpts = OrgAllowedActionsFixtureOptions;

export function makeOrgAllowedActionsResponse(options: OrgAllowedOpts = {}): OrgBody {
	return {
		github_owned_allowed: options.githubOwnedAllowed ?? true,
		verified_allowed: options.verifiedAllowed ?? false,
		patterns_allowed: options.patternsAllowed ??
			[ 'actions/checkout@8f4b7f84864484a7bf31766abe9204da3cbe65b3' ],
	};
}

export function makeOrgForkPrApprovalResponse(policy = 'all_external_contributors'): OrgBody {
	return { approval_policy: policy };
}

export type OrgPrivateForkPrFixtureOptions = {
	runWorkflowsFromForkPullRequests?: boolean;
	sendWriteTokensToWorkflows?: boolean;
	sendSecretsAndVariables?: boolean;
	requireApprovalForForkPrWorkflows?: boolean;
};

type OrgForkPrOpts = OrgPrivateForkPrFixtureOptions;

export function makeOrgPrivateForkPrResponse(options: OrgForkPrOpts = {}): OrgBody {
	return {
		run_workflows_from_fork_pull_requests:
			options.runWorkflowsFromForkPullRequests ?? false,
		send_write_tokens_to_workflows: options.sendWriteTokensToWorkflows ?? false,
		send_secrets_and_variables: options.sendSecretsAndVariables ?? false,
		require_approval_for_fork_pr_workflows:
			options.requireApprovalForForkPrWorkflows ?? true,
	};
}

export type OrgHookFixture = {
	id: number;
	url: string;
	insecureSsl?: string;
};

export function makeOrgHooksResponse(hooks: OrgHookFixture[]): Record<string, unknown>[] {
	return hooks.map(toOrgHook);
}

function toOrgHook(hook: OrgHookFixture): Record<string, unknown> {
	return {
		id: hook.id,
		config: {
			url: hook.url,
			insecure_ssl: hook.insecureSsl ?? '0',
		},
	};
}
