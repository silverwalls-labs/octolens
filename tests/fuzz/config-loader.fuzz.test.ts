import {
	describe,
	test,
	before,
	after,
} from 'node:test';
import assert from 'node:assert/strict';
import {
	mkdirSync, mkdtempSync, writeFileSync, rmSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import fc from 'fast-check';
import {
	loadConfig, ConfigError, PROJECT_CONFIG_FILES,
} from '../../src/config/loader.ts';
import { SEVERITIES } from '../../src/types/index.ts';
import { fuzzParams } from '../helpers/arbitraries.ts';

const SECTIONS = [
	'rules',
	'ignore',
	'org',
];
const RULE_SETTINGS = [ ...SEVERITIES, 'off' ];

const arbRuleSetting = fc.constantFrom(...RULE_SETTINGS);

/*
 * "__proto__" is excluded: jsonc-parser drops that key at parse, so it
 * cannot round-trip through every grammar. Its exact per-format
 * semantics are pinned by example-based unit tests instead.
 */
const arbRuleId = fc.string({ minLength: 1 }).filter((id) => id !== '__proto__');

/** A config that must always validate. */
const arbValidConfig = fc.record({
	rules: fc.dictionary(arbRuleId, arbRuleSetting),
	ignore: fc.record({
		repos: fc.array(fc.string()),
		archived: fc.boolean(),
		forks: fc.boolean(),
	}, { requiredKeys: [] }),
	org: fc.record({
		concurrency: fc.integer({ min: 1, max: 32 }),
	}, { requiredKeys: [] }),
}, { requiredKeys: [] });

let root: string;
let homeDir: string;
let homeConfigPath: string;
let pkgDir: string;
let pkgPath: string;

/** One working directory per project file name, avoiding ambiguity errors. */
const dirs = new Map<string, { cwd: string; configPath: string; }>();

/**
 * Load the given raw contents as the named project config file.
 *
 * @param raw  - Exact file contents to load.
 * @param name - Project config file name selecting the grammar.
 * @returns    The loader result.
 */
function loadRaw(raw: string, name: string): ReturnType<typeof loadConfig> {
	const dir = dirs.get(name) as { cwd: string; configPath: string; };

	writeFileSync(dir.configPath, raw);

	return loadConfig({
		cwd: dir.cwd, env: {}, home: join(root, 'no-home'),
	});
}

describe('config loader fuzz', () => {
	before(() => {
		root = mkdtempSync(join(tmpdir(), 'octolens-fuzz-'));
		for (const name of PROJECT_CONFIG_FILES) {
			const cwd = join(root, name.split('.').pop() as string);

			mkdirSync(cwd);
			dirs.set(name, { cwd, configPath: join(cwd, name) });
		}
		homeDir = join(root, 'home');
		homeConfigPath = join(homeDir, '.config', 'octolens', 'config.json');
		mkdirSync(join(homeDir, '.config', 'octolens'), { recursive: true });
		pkgDir = join(root, 'pkg');
		pkgPath = join(pkgDir, 'package.json');
		mkdirSync(pkgDir);
	});

	after(() => {
		rmSync(root, { recursive: true, force: true });
	});

	test('arbitrary file contents load or fail with a ConfigError', () => {
		// Binary units cover the full code-point range, lone surrogates included.
		fc.assert(fc.property(
			fc.string({ unit: 'binary' }),
			fc.constantFrom(...PROJECT_CONFIG_FILES),
			(raw: string, name: string): void => {
				try {
					loadRaw(raw, name);
				} catch (err) {
					// The only error a caller ever sees names the file.
					assert.ok(err instanceof ConfigError);
					assert.ok(err.message.includes(name));
				}
			},
		), fuzzParams);
	});

	test('arbitrary JSON documents load or fail with a ConfigError', () => {
		// Valid JSON is valid JSONC and JSON5, so one document feeds all grammars.
		fc.assert(fc.property(
			fc.jsonValue(),
			fc.constantFrom(...PROJECT_CONFIG_FILES),
			(doc: unknown, name: string): void => {
				let result;

				try {
					result = loadRaw(JSON.stringify(doc), name);
				} catch (err) {
					assert.ok(err instanceof ConfigError);
					assert.ok(err.message.includes(name));

					return;
				}

				// Whatever loads conforms to the OctolensConfig shape.
				assert.equal(result.sources.length, 1);
				for (const key of Object.keys(result.config)) {
					assert.ok(SECTIONS.includes(key));
				}
				for (const setting of Object.values(result.config.rules ?? {})) {
					assert.ok(RULE_SETTINGS.includes(setting));
				}
			},
		), fuzzParams);
	});

	test('arbitrary package.json octolens keys load or fail with a ConfigError', () => {
		fc.assert(fc.property(fc.jsonValue(), (doc: unknown): void => {
			writeFileSync(pkgPath, JSON.stringify({ name: 'app', octolens: doc }));

			let result;

			try {
				result = loadConfig({
					cwd: pkgDir, env: {}, home: join(root, 'no-home'),
				});
			} catch (err) {
				assert.ok(err instanceof ConfigError);
				assert.ok(err.message.includes('package.json#octolens'));

				return;
			}

			// An undefined key round-trips to "no source" via JSON.stringify.
			assert.ok(result.sources.length <= 1);
			for (const key of Object.keys(result.config)) {
				assert.ok(SECTIONS.includes(key));
			}
		}), fuzzParams);
	});

	test('merging two valid configs keeps every key, project winning', () => {
		fc.assert(fc.property(arbValidConfig, arbValidConfig, (homeDoc, projectDoc): void => {
			const dir = dirs.get('octolens.config.json') as { cwd: string; configPath: string; };

			writeFileSync(homeConfigPath, JSON.stringify(homeDoc));
			writeFileSync(dir.configPath, JSON.stringify(projectDoc));

			const { config, sources } = loadConfig({
				cwd: dir.cwd, env: {}, home: homeDir,
			});

			assert.equal(sources.length, 2);
			assert.deepEqual(
				new Map(Object.entries(config.rules ?? {})),
				new Map([
					...Object.entries(homeDoc.rules ?? {}),
					...Object.entries(projectDoc.rules ?? {}),
				]),
			);
			assert.deepEqual(
				{ ...config.ignore },
				{ ...homeDoc.ignore, ...projectDoc.ignore },
			);
			assert.deepEqual(
				{ ...config.org },
				{ ...homeDoc.org, ...projectDoc.org },
			);
		}), fuzzParams);
	});

	test('valid configs always load and round-trip losslessly', () => {
		fc.assert(fc.property(
			arbValidConfig,
			fc.constantFrom(...PROJECT_CONFIG_FILES),
			(doc, name): void => {
				const { config, sources } = loadRaw(JSON.stringify(doc), name);

				assert.equal(sources.length, 1);
				assert.deepEqual(
					new Map(Object.entries(config.rules ?? {})),
					new Map(Object.entries(doc.rules ?? {})),
				);
				assert.deepEqual(
					{ ...config.ignore },
					{ ...doc.ignore },
				);
				assert.deepEqual(
					{ ...config.org },
					{ ...doc.org },
				);
			},
		), fuzzParams);
	});
});
