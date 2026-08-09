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
