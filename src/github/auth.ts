import { execSync } from 'node:child_process';

/** Options for {@link resolveAuth}. */
export type AuthOptions = {
	/** Explicit token value (highest priority). */
	token?: string;
};

/** Resolved authentication token and where it came from. */
export type ResolvedAuth = {
	token: string;
	source: 'flag' | 'env' | 'gh-cli';
};

/**
 * Thrown by {@link resolveAuth} when no GitHub token can be found
 * through any of the supported resolution methods.
 */
export class AuthError extends Error {
	/**
	 * Create the error.
	 *
	 * @param message - Human-readable description of the authentication failure.
	 */
	constructor(message: string) {
		super(message);
		this.name = 'AuthError';
	}
}

/**
 * Resolve a GitHub token from multiple sources, in priority order:
 *
 * 1. `options.token` (the `--token` flag)
 * 2. `GITHUB_TOKEN` or `OCTOLENS_TOKEN` environment variable
 * 3. `gh auth token` CLI fallback (3 s timeout).
 *
 * @param    options - Optional explicit token.
 * @returns          The resolved token and its source.
 * @throws {AuthError} If no token can be found.
 */
export function resolveAuth(options: AuthOptions = {}): ResolvedAuth {
	if (options.token && options.token.length > 0) {
		return { token: options.token, source: 'flag' };
	}

	const envToken = process.env.GITHUB_TOKEN ?? process.env.OCTOLENS_TOKEN;

	if (envToken && envToken.length > 0) {
		return { token: envToken, source: 'env' };
	}

	const ghToken = tryReadGhCliToken();

	if (ghToken) {
		return { token: ghToken, source: 'gh-cli' };
	}

	throw new AuthError('No GitHub token found. Provide one via --token, ' +
		'the GITHUB_TOKEN env var, or `gh auth login`.');
}

/**
 * Read a token via `gh auth token`, returning `undefined` on any failure.
 *
 * @returns The token, or `undefined` when unavailable.
 */
function tryReadGhCliToken(): string | undefined {
	try {
		const stdout = execSync('gh auth token', {
			stdio: [
				'ignore',
				'pipe',
				'ignore',
			],
			encoding: 'utf8',
			timeout: 3000,
		}).trim();

		return stdout.length > 0 ?
			stdout :
			undefined;
	} catch {
		return undefined;
	}
}
