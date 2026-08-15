import type { Severity } from './severity.ts';

/** Minimal GitHub repository identifier. */
export type RepoRef = {
	owner: string;
	name: string;
};

/** A named hyperlink attached to a {@link Finding}. */
export type Reference = {
	name: string;
	url: string;
};

/**
 * A single audit finding produced by a rule.
 *
 * Exactly one subject field is set: repo-scoped rules set {@link repo},
 * org-scoped rules set {@link org}.
 */
export type Finding = {
	/** ID of the rule that produced this finding. */
	ruleId: string;

	/** Severity assigned to this finding. */
	severity: Severity;

	/** The repository this finding applies to. Absent on org-rule findings. */
	repo?: RepoRef;

	/** The organisation this finding applies to. Absent on repo-rule findings. */
	org?: string;

	/** Short human-readable title. */
	title: string;

	/** Longer explanation of the issue. */
	detail?: string;

	/** Suggested fix or corrective action. */
	remediation?: string;

	/** Links to documentation or related resources. */
	references?: Reference[];
};
