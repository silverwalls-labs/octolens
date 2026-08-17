import {
	describe,
	test,
	beforeEach,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	chmodSync,
	mkdtempSync,
	rmSync,
	writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { resolveAuth, AuthError } from '../../../src/github/auth.ts';

const saved: Record<string, string | undefined> = {};
const tempDirs: string[] = [];

describe('resolveAuth', () => {
	beforeEach(() => {
		saved.GITHUB_TOKEN = process.env.GITHUB_TOKEN;
		saved.OCTOLENS_TOKEN = process.env.OCTOLENS_TOKEN;
		saved.PATH = process.env.PATH;
		delete process.env.GITHUB_TOKEN;
		delete process.env.OCTOLENS_TOKEN;
	});

	afterEach(() => {
		for (const name of [
			'GITHUB_TOKEN',
			'OCTOLENS_TOKEN',
			'PATH',
		]) {
			if (saved[name] === undefined) {
				delete process.env[name];
			} else {
				process.env[name] = saved[name];
			}
		}

		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	test(
		'an explicit token wins over environment variables',
		() => {
			process.env.GITHUB_TOKEN = 'env-token';

			const auth = resolveAuth({ token: 'flag-token' });

			assert.deepEqual(auth, {
				token: 'flag-token', source: 'flag',
			});
		},
	);

	test(
		'an empty explicit token falls through to the environment',
		() => {
			process.env.GITHUB_TOKEN = 'env-token';

			const auth = resolveAuth({ token: '' });

			assert.deepEqual(auth, {
				token: 'env-token', source: 'env',
			});
		},
	);

	test('GITHUB_TOKEN is read from the environment', () => {
		process.env.GITHUB_TOKEN = 'gh-env-token';

		const auth = resolveAuth();

		assert.deepEqual(auth, {
			token: 'gh-env-token', source: 'env',
		});
	});

	test(
		'OCTOLENS_TOKEN is used when GITHUB_TOKEN is unset',
		() => {
			process.env.OCTOLENS_TOKEN = 'octolens-env-token';

			const auth = resolveAuth();

			assert.deepEqual(auth, {
				token: 'octolens-env-token', source: 'env',
			});
		},
	);

	test(
		'the gh CLI is used when no flag or env token exists',
		() => {
			process.env.PATH = makeFakeGhDir('gh-cli-token');

			const auth = resolveAuth();

			assert.deepEqual(auth, {
				token: 'gh-cli-token', source: 'gh-cli',
			});
		},
	);

	test('empty gh CLI output resolves to no token', () => {
		process.env.PATH = makeFakeGhDir('');

		assert.throws(() => resolveAuth(), AuthError);
	});

	test('a missing gh binary resolves to no token', () => {
		process.env.PATH = '';

		assert.throws(() => resolveAuth(), AuthError);
	});

	test(
		'an empty env token does not count as authentication',
		() => {
			process.env.GITHUB_TOKEN = '';
			process.env.PATH = '';

			assert.throws(() => resolveAuth(), AuthError);
		},
	);
});

/** Create a directory containing a fake `gh` executable printing `output`. */
function makeFakeGhDir(output: string): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-gh-'));
	const script = join(dir, 'gh');

	writeFileSync(script, `#!/bin/sh\necho '${output}'\n`);
	chmodSync(script, 0o755);
	tempDirs.push(dir);

	return dir;
}
