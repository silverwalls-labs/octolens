import {
	describe,
	test,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdtempSync, mkdirSync, symlinkSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
	loadConfig, ConfigError, PROJECT_CONFIG_FILES,
} from '../../../src/config/loader.ts';

const [ PROJECT_JSON ] = PROJECT_CONFIG_FILES;

const tempDirs: string[] = [];

function makeTempDir(): string {
	const dir = mkdtempSync(join(tmpdir(), 'octolens-config-'));

	tempDirs.push(dir);

	return dir;
}

/** Serialise a config value; strings pass through raw for malformed cases. */
function body(value: unknown): string {
	return typeof value === 'string' ?
		value :
		JSON.stringify(value);
}

/** Write a home-level config under `<home>/.config/octolens/`. */
function writeHomeConfig(home: string, value: unknown, name = 'config.json'): string {
	const dir = join(home, '.config', 'octolens');

	mkdirSync(dir, { recursive: true });
	const path = join(dir, name);

	writeFileSync(path, body(value));

	return path;
}

/** Write a config under `<configHome>/octolens/config.json`. */
function writeXdgConfig(configHome: string, value: unknown): string {
	const dir = join(configHome, 'octolens');

	mkdirSync(dir, { recursive: true });
	const path = join(dir, 'config.json');

	writeFileSync(path, body(value));

	return path;
}

/** Write a project config in the given working directory. */
function writeProjectConfig(cwd: string, value: unknown, name: string = PROJECT_JSON): string {
	const path = join(cwd, name);

	writeFileSync(path, body(value));

	return path;
}

type LoadOverrides = {
	cwd?: string;
	env?: Record<string, string | undefined>;
	home?: string;
};

/** Call loadConfig with hermetic defaults: empty env, fresh cwd and home. */
function load(overrides: LoadOverrides = {}): ReturnType<typeof loadConfig> {
	return loadConfig({
		cwd: overrides.cwd ?? makeTempDir(),
		env: overrides.env ?? {},
		home: overrides.home ?? makeTempDir(),
	});
}

describe('config loader', () => {
	afterEach(() => {
		for (const dir of tempDirs.splice(0)) {
			rmSync(dir, { recursive: true, force: true });
		}
	});

	describe('discovery', () => {
		test('returns an empty config when no file exists', () => {
			const { config, sources } = load();

			assert.deepEqual(config, {});
			assert.deepEqual(sources, []);
		});

		test('loads the project file from the working directory', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, { org: { concurrency: 8 } });

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, { org: { concurrency: 8 } });
			assert.deepEqual(sources, [ path ]);
		});

		test('loads the home file from ~/.config/octolens/config.json', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(home, { ignore: { forks: true } });

			const { config, sources } = load({ home });

			assert.deepEqual(config, { ignore: { forks: true } });
			assert.deepEqual(sources, [ path ]);
		});

		test('prefers $XDG_CONFIG_HOME over the home directory', () => {
			const home = makeTempDir();
			const xdg = makeTempDir();

			writeHomeConfig(home, { org: { concurrency: 2 } });
			const path = writeXdgConfig(xdg, { org: { concurrency: 6 } });

			const { config, sources } = load({ home, env: { XDG_CONFIG_HOME: xdg } });

			assert.deepEqual(config, { org: { concurrency: 6 } });
			assert.deepEqual(sources, [ path ]);
		});

		test('falls back to the home directory when XDG_CONFIG_HOME is blank', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(home, { org: { concurrency: 2 } });

			const { config, sources } = load({ home, env: { XDG_CONFIG_HOME: '   ' } });

			assert.deepEqual(config, { org: { concurrency: 2 } });
			assert.deepEqual(sources, [ path ]);
		});

		test('ignores a relative XDG_CONFIG_HOME, per the XDG spec', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(home, { org: { concurrency: 2 } });

			const { config, sources } = load({
				home,
				env: { XDG_CONFIG_HOME: 'relative/config' },
			});

			assert.deepEqual(config, { org: { concurrency: 2 } });
			assert.deepEqual(sources, [ path ]);
		});

		test('accepts a file starting with a UTF-8 BOM', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, `﻿${JSON.stringify({ org: { concurrency: 4 } })}`);

			const { config } = load({ cwd });

			assert.deepEqual(config, { org: { concurrency: 4 } });
		});

		test('treats a non-directory path segment as no config', () => {
			const dir = makeTempDir();
			const file = join(dir, 'not-a-dir');

			writeFileSync(file, 'plain file');

			// The project path traverses a regular file: ENOTDIR, not an error.
			const { config, sources } = load({ cwd: join(file, 'nested') });

			assert.deepEqual(config, {});
			assert.deepEqual(sources, []);
		});

		test('defaults to process.cwd() and process.env', () => {
			const dir = makeTempDir();
			const savedXdg = process.env.XDG_CONFIG_HOME;
			const savedCwd = process.cwd();

			process.env.XDG_CONFIG_HOME = join(dir, 'xdg');
			process.chdir(dir);
			try {
				writeProjectConfig(dir, { org: { concurrency: 3 } });

				const { config, sources } = loadConfig();

				assert.deepEqual(config, { org: { concurrency: 3 } });
				assert.equal(sources.length, 1);
			} finally {
				process.chdir(savedCwd);
				if (savedXdg === undefined) {
					delete process.env.XDG_CONFIG_HOME;
				} else {
					process.env.XDG_CONFIG_HOME = savedXdg;
				}
			}
		});
	});

	describe('merging', () => {
		test('merges home and project files with the project winning per key', () => {
			const home = makeTempDir();
			const cwd = makeTempDir();

			const homePath = writeHomeConfig(home, {
				rules: { 'a/one': 'off', 'a/two': 'off' },
				ignore: { archived: false },
				org: { concurrency: 2 },
			});
			const projectPath = writeProjectConfig(cwd, {
				rules: { 'a/two': 'high' },
				ignore: { forks: true },
			});

			const { config, sources } = load({ home, cwd });

			assert.deepEqual(config, {
				rules: { 'a/one': 'off', 'a/two': 'high' },
				ignore: { archived: false, forks: true },
				org: { concurrency: 2 },
			});
			assert.deepEqual(sources, [ homePath, projectPath ]);
		});

		test('replaces arrays instead of concatenating them', () => {
			const home = makeTempDir();
			const cwd = makeTempDir();

			writeHomeConfig(home, { ignore: { repos: [ 'acme/a', 'acme/b' ] } });
			writeProjectConfig(cwd, { ignore: { repos: [ 'acme/c' ] } });

			const { config } = load({ home, cwd });

			assert.deepEqual(config.ignore?.repos, [ 'acme/c' ]);
		});

		test('accepts severity values as rule overrides', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { rules: { 'a/one': 'medium' } });

			const { config } = load({ cwd });

			assert.deepEqual(config.rules, { 'a/one': 'medium' });
		});
	});

	describe('validation', () => {
		test('rejects malformed JSON, naming the file', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, '{ nope');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.name === 'ConfigError' &&
					err.message.includes(path) &&
					err.message.includes('invalid JSON'),
			);
		});

		test('rejects a non-regular file at the config path', () => {
			const cwd = makeTempDir();

			// A directory (like a FIFO or socket) is caught by the stat guard.
			mkdirSync(join(cwd, PROJECT_JSON));

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('cannot read config file (not a regular file)'),
			);
		});

		test('rejects an unreadable config file', () => {
			const cwd = makeTempDir();
			const path = join(cwd, PROJECT_JSON);

			// A self-referencing symlink fails the stat with ELOOP.
			symlinkSync(path, path);

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('cannot read config file') &&
					!err.message.includes('not a regular file'),
			);
		});

		test('rejects an empty config file', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('invalid JSON'),
			);
		});

		test('rejects a non-object root', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, [ 1, 2 ]);

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"config" must be an object'),
			);
		});

		test('rejects a null root', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, 'null');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"config" must be an object, got null'),
			);
		});

		test('rejects a non-object ignore section', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: true });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"ignore" must be an object, got true'),
			);
		});

		test('rejects a non-object org section', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { org: 4 });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"org" must be an object, got 4'),
			);
		});

		test('keeps a rule ID literally named "__proto__"', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '{"rules": {"__proto__": "off"}}');

			const { config } = load({ cwd });

			assert.deepEqual(
				Object.entries(config.rules ?? {}),
				[ [ '__proto__', 'off' ] ],
			);

			// And it never polluted the prototype chain.
			assert.equal(({} as Record<string, unknown>).octolens, undefined);
			assert.equal(Object.getPrototypeOf(config.rules), Object.prototype);
		});

		test('errors in the home file name the home file', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(home, { bogus: true });

			assert.throws(
				() => load({ home }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes(path),
			);
		});

		test('rejects unknown root keys', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { output: { format: 'md' } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('unknown key "output"') &&
					err.message.includes('rules, ignore, org'),
			);
		});

		test('rejects a non-object rules section', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { rules: 'all' });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"rules" must be an object'),
			);
		});

		test('rejects boolean rule overrides', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { rules: { 'repo-config/license-file-present': true } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"rules.repo-config/license-file-present"') &&
					err.message.includes('critical | high | medium | low | info | off') &&
					err.message.includes('got true'),
			);
		});

		test('rejects unknown rule override strings', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { rules: { 'a/one': 'sometimes' } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('got "sometimes"'),
			);
		});

		test('rejects unknown ignore keys', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: { fork: true } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('unknown key "ignore.fork"') &&
					err.message.includes('repos, archived, forks'),
			);
		});

		test('rejects a non-array ignore.repos', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: { repos: 'acme/a' } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"ignore.repos" must be an array'),
			);
		});

		test('rejects non-string ignore.repos entries', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: { repos: [ 'acme/a', 7 ] } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"ignore.repos" must be an array'),
			);
		});

		test('rejects a non-boolean ignore.archived', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: { archived: 'yes' } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"ignore.archived" must be a boolean') &&
					err.message.includes('got "yes"'),
			);
		});

		test('rejects a non-boolean ignore.forks', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { ignore: { forks: 1 } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"ignore.forks" must be a boolean'),
			);
		});

		test('rejects unknown org keys', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { org: { parallelism: 4 } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('unknown key "org.parallelism"'),
			);
		});

		test('rejects out-of-range org.concurrency values', () => {
			for (const concurrency of [
				'4',
				2.5,
				0,
				33,
				1e15,
			]) {
				const cwd = makeTempDir();

				writeProjectConfig(cwd, { org: { concurrency } });

				assert.throws(
					() => load({ cwd }),
					(err: unknown) => err instanceof ConfigError &&
						err.message.includes('"org.concurrency" must be an integer') &&
						err.message.includes('between 1 and 32'),
				);
			}
		});

		test('truncates long offending values in error messages', () => {
			const cwd = makeTempDir();
			const long = 'x'.repeat(100);

			writeProjectConfig(cwd, { rules: { 'a/one': long } });

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('...') &&
					!err.message.includes(long),
			);
		});
	});

	describe('jsonc files', () => {
		test('parses comments and trailing commas', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, [
				'{',
				'  // disable signing for now',
				'  "rules": {',
				'    "repo-config/require-signed-commits": "off", /* trailing */',
				'  },',
				'  "ignore": { "repos": [ "acme/a", "acme/b", ] },',
				'}',
			].join('\n'), 'octolens.config.jsonc');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, {
				rules: { 'repo-config/require-signed-commits': 'off' },
				ignore: { repos: [ 'acme/a', 'acme/b' ] },
			});
			assert.deepEqual(sources, [ path ]);
		});

		test('loads a home-level config.jsonc', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(
				home,
				'// home defaults\n{ "org": { "concurrency": 6 } }',
				'config.jsonc',
			);

			const { config, sources } = load({ home });

			assert.deepEqual(config, { org: { concurrency: 6 } });
			assert.deepEqual(sources, [ path ]);
		});

		test('accepts a UTF-8 BOM', () => {
			const cwd = makeTempDir();

			writeProjectConfig(
				cwd,
				'﻿// bom\n{ "org": { "concurrency": 4 } }',
				'octolens.config.jsonc',
			);

			const { config } = load({ cwd });

			assert.deepEqual(config, { org: { concurrency: 4 } });
		});

		test('rejects invalid syntax with a line and column', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, '{\n  "rules": nope\n}', 'octolens.config.jsonc');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes(path) &&
					err.message.includes('invalid JSONC') &&
					(/at 2:\d+/).test(err.message),
			);
		});

		test('does not extend to JSON5 syntax (unquoted keys)', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '{ rules: {} }', 'octolens.config.jsonc');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('invalid JSONC'),
			);
		});

		test('rejects an empty document', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '', 'octolens.config.jsonc');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('invalid JSONC'),
			);
		});

		test('rejects a comments-only document', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '// nothing here\n', 'octolens.config.jsonc');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('invalid JSONC'),
			);
		});

		test('never pollutes the prototype chain', () => {
			const cwd = makeTempDir();

			writeProjectConfig(
				cwd,
				'{ "rules": { "__proto__": "off" } }',
				'octolens.config.jsonc',
			);

			const { config } = load({ cwd });

			assert.equal(({} as Record<string, unknown>).polluted, undefined);
			assert.equal(Object.getPrototypeOf(config.rules), Object.prototype);
		});
	});

	describe('json5 files', () => {
		test('parses unquoted keys, single quotes, trailing commas, and hex', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, [
				'{',
				"  rules: { 'repo-config/topics-present': 'off', },",
				'  org: { concurrency: 0x10 },',
				'}',
			].join('\n'), 'octolens.config.json5');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, {
				rules: { 'repo-config/topics-present': 'off' },
				org: { concurrency: 16 },
			});
			assert.deepEqual(sources, [ path ]);
		});

		test('loads a home-level config.json5', () => {
			const home = makeTempDir();
			const path = writeHomeConfig(
				home,
				'{ ignore: { forks: true } }',
				'config.json5',
			);

			const { config, sources } = load({ home });

			assert.deepEqual(config, { ignore: { forks: true } });
			assert.deepEqual(sources, [ path ]);
		});

		test('rejects Infinity concurrency at the schema, not the parser', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '{ org: { concurrency: Infinity } }', 'octolens.config.json5');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('"org.concurrency" must be an integer'),
			);
		});

		test('rejects invalid syntax with a line and column', () => {
			const cwd = makeTempDir();
			const path = writeProjectConfig(cwd, '{\n  rules:\n', 'octolens.config.json5');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes(path) &&
					err.message.includes('invalid JSON5') &&
					(/at \d+:\d+/).test(err.message),
			);
		});

		test('keeps a rule ID literally named "__proto__" without pollution', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, "{ rules: { '__proto__': 'off' } }", 'octolens.config.json5');

			const { config } = load({ cwd });

			assert.deepEqual(
				Object.entries(config.rules ?? {}),
				[ [ '__proto__', 'off' ] ],
			);
			assert.equal(({} as Record<string, unknown>).polluted, undefined);
		});
	});

	describe('package.json key', () => {
		test('loads the octolens key as the project source', () => {
			const cwd = makeTempDir();
			const pkgPath = writeProjectConfig(cwd, {
				name: 'app',
				octolens: { rules: { 'a/one': 'off' } },
			}, 'package.json');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, { rules: { 'a/one': 'off' } });
			assert.deepEqual(sources, [ `${pkgPath}#octolens` ]);
		});

		test('a package.json without the key is not a source', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { name: 'app' }, 'package.json');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, {});
			assert.deepEqual(sources, []);
		});

		test('a non-object package.json root is not a source', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, [
				'not',
				'a',
				'manifest',
			], 'package.json');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, {});
			assert.deepEqual(sources, []);
		});

		test('errors in the key are labelled with #octolens', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { octolens: { rules: { 'a/one': true } } }, 'package.json');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('package.json#octolens') &&
					err.message.includes('"rules.a/one"'),
			);
		});

		test('rejects a non-object octolens key', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, { octolens: 'strict' }, 'package.json');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('package.json#octolens') &&
					err.message.includes('"config" must be an object'),
			);
		});

		test('rejects a malformed package.json', () => {
			const cwd = makeTempDir();

			writeProjectConfig(cwd, '{ broken', 'package.json');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('package.json') &&
					err.message.includes('invalid JSON'),
			);
		});

		test('merges below a home config, project key winning', () => {
			const home = makeTempDir();
			const cwd = makeTempDir();

			writeHomeConfig(home, { rules: { 'a/one': 'off' }, org: { concurrency: 2 } });
			writeProjectConfig(cwd, { octolens: { rules: { 'a/one': 'high' } } }, 'package.json');

			const { config } = load({ home, cwd });

			assert.deepEqual(config, {
				rules: { 'a/one': 'high' },
				org: { concurrency: 2 },
			});
		});
	});

	describe('source ambiguity', () => {
		test('rejects two dedicated project files, listing both', () => {
			const cwd = makeTempDir();
			const jsonPath = writeProjectConfig(cwd, {});
			const jsoncPath = writeProjectConfig(cwd, '{}', 'octolens.config.jsonc');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('multiple config sources') &&
					err.message.includes(jsonPath) &&
					err.message.includes(jsoncPath),
			);
		});

		test('rejects two home files', () => {
			const home = makeTempDir();

			writeHomeConfig(home, {});
			writeHomeConfig(home, '{}', 'config.json5');

			assert.throws(
				() => load({ home }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('multiple config sources'),
			);
		});

		test('rejects a dedicated file next to a populated package.json key', () => {
			const cwd = makeTempDir();
			const filePath = writeProjectConfig(cwd, {});
			const pkgPath = writeProjectConfig(cwd, { octolens: {} }, 'package.json');

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					err.message.includes('multiple config sources') &&
					err.message.includes(filePath) &&
					err.message.includes(`${pkgPath}#octolens`),
			);
		});

		test('allows a dedicated file next to a package.json without the key', () => {
			const cwd = makeTempDir();
			const filePath = writeProjectConfig(cwd, { org: { concurrency: 3 } });

			writeProjectConfig(cwd, { name: 'app' }, 'package.json');

			const { config, sources } = load({ cwd });

			assert.deepEqual(config, { org: { concurrency: 3 } });
			assert.deepEqual(sources, [ filePath ]);
		});

		test('rejects three dedicated files, listing all of them', () => {
			const cwd = makeTempDir();
			const paths = [
				writeProjectConfig(cwd, {}),
				writeProjectConfig(cwd, '{}', 'octolens.config.jsonc'),
				writeProjectConfig(cwd, '{}', 'octolens.config.json5'),
			];

			assert.throws(
				() => load({ cwd }),
				(err: unknown) => err instanceof ConfigError &&
					paths.every((p) => err.message.includes(p)),
			);
		});
	});
});
