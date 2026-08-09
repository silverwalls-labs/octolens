import type { Severity } from './severity.ts';

export type RuleSetting = Severity | 'off';

export type OctolensConfig = {
	rules?: Record<string, RuleSetting>;
	ignore?: {
		repos?: string[];
		archived?: boolean;
		forks?: boolean;
	};
	org?: {
		concurrency?: number;
	};
};
