import { execSync } from 'node:child_process';

export type AuthOptions = {
	token?: string;
};

export type ResolvedAuth = {
	token: string;
	source: 'flag' | 'env' | 'gh-cli';
};

export class AuthError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'AuthError';
	}
}

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
