import type { Severity } from './severity.ts';

export type RepoRef = {
	owner: string;
	name: string;
};

export type Reference = {
	name: string;
	url: string;
};

export type Finding = {
	ruleId: string;
	severity: Severity;
	repo: RepoRef;
	title: string;
	detail?: string;
	remediation?: string;
	references?: Reference[];
};
