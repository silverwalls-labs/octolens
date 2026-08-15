import nock from 'nock';
import { Octokit } from '@octokit/rest';
import { createCachedFetcher } from '../../src/github/fetcher.ts';
import type {
	OrgRuleContext, RuleConfigBag, RuleContext,
} from '../../src/types/index.ts';

function noop() {
	/* intentional no-op */
}

export type ContextOverrides = {
	ruleConfig?: RuleConfigBag;
};

export function makeContext(overrides: ContextOverrides = {}): RuleContext {
	return {
		repo: { owner: 'sheplu', name: 'Octolens' },
		octokit: new Octokit({
			auth: 'test-token',
			request: { retries: 0 },
		}),
		cache: createCachedFetcher(),
		logger: {
			debug: noop,
			info: noop,
			warn: noop,
			error: noop,
		},
		ruleConfig: overrides.ruleConfig ?? {},
	};
}

export function makeOrgContext(overrides: ContextOverrides = {}): OrgRuleContext {
	return {
		org: 'silverwalls-labs',
		octokit: new Octokit({
			auth: 'test-token',
			request: { retries: 0 },
		}),
		cache: createCachedFetcher(),
		logger: {
			debug: noop,
			info: noop,
			warn: noop,
			error: noop,
		},
		ruleConfig: overrides.ruleConfig ?? {},
	};
}

export function disableNet() {
	nock.disableNetConnect();
}

export function restoreNet() {
	nock.cleanAll();
	nock.enableNetConnect();
}
