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

/** Shared stdout/stderr capture for CLI and smoke tests. */
export type CapturedOutput = {
	stdoutChunks: string[];
	stderrChunks: string[];
};

const stdoutChunks: string[] = [];
const stderrChunks: string[] = [];
let savedStdout: typeof process.stdout.write | undefined;
let savedStderr: typeof process.stderr.write | undefined;

/**
 * Redirect stdout/stderr into chunk arrays. Call once per test body.
 * Non-string chunks (test-runner Buffers) pass through to the real stream
 * so they do not corrupt captured CLI output.
 */
export function captureOutput(): CapturedOutput {
	savedStdout = process.stdout.write.bind(process.stdout);
	savedStderr = process.stderr.write.bind(process.stderr);

	const out = savedStdout;
	const err = savedStderr;

	process.stdout.write = function spy(chunk: string | Uint8Array): boolean {
		if (typeof chunk !== 'string') {
			return out(chunk);
		}
		stdoutChunks.push(chunk);

		return true;
	};
	process.stderr.write = function spy(chunk: string | Uint8Array): boolean {
		if (typeof chunk !== 'string') {
			return err(chunk);
		}
		stderrChunks.push(chunk);

		return true;
	};

	return { stdoutChunks, stderrChunks };
}

/** Restore original stdout/stderr and clear captured chunks. Use as afterEach. */
export function restoreOutput() {
	if (savedStdout) {
		process.stdout.write = savedStdout;
	}
	if (savedStderr) {
		process.stderr.write = savedStderr;
	}
	stdoutChunks.length = 0;
	stderrChunks.length = 0;
	savedStdout = undefined;
	savedStderr = undefined;
}
