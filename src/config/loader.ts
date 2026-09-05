import { readFileSync, statSync } from 'node:fs';
import { homedir } from 'node:os';
import { isAbsolute, join } from 'node:path';
import {
	parse as parseJsoncText, printParseErrorCode, type ParseError,
} from 'jsonc-parser';
import JSON5 from 'json5';
import {
	SEVERITIES, isSeverity, type Severity,
} from '../types/severity.ts';
import type { OctolensConfig } from '../types/config.ts';

/** Dedicated config file names looked up in the working directory. */
export const PROJECT_CONFIG_FILES = [
	'octolens.config.json',
	'octolens.config.jsonc',
	'octolens.config.json5',
] as const;

/** Config file names looked up under the octolens config-home directory. */
export const HOME_CONFIG_FILES = [
	'config.json',
	'config.jsonc',
	'config.json5',
] as const;

/** Valid values for a rule override, for error messages. */
const RULE_SETTING_VALUES = `${SEVERITIES.join(' | ')} | off`;

/** Upper bound for `org.concurrency`, matching the `--concurrency` flag. */
const MAX_CONCURRENCY = 32;

/**
 * Thrown by {@link loadConfig} when a config file exists but cannot be
 * read, is not valid JSON, or does not match the {@link OctolensConfig}
 * schema. The message always names the offending file.
 */
export class ConfigError extends Error {
	/**
	 * Create the error.
	 *
	 * @param message - Human-readable description of the configuration problem.
	 */
	constructor(message: string) {
		super(message);
		this.name = 'ConfigError';
	}
}

/** Options for {@link loadConfig}. */
export type LoadConfigOptions = {
	/** Directory searched for the project file. Defaults to `process.cwd()`. */
	cwd?: string;

	/** Environment variables. Defaults to `process.env`. Test injection. */
	env?: Record<string, string | undefined>;

	/** Home directory. Defaults to `os.homedir()`. Test injection. */
	home?: string;
};

/** Result of {@link loadConfig}. */
export type LoadedConfig = {
	/** The merged configuration; empty when no file was found. */
	config: OctolensConfig;

	/** Paths of the config files that were loaded, in merge order. */
	sources: string[];
};

/**
 * Discover, validate, and merge the user configuration sources.
 *
 * Two locations are consulted, in order:
 *
 * 1. `$XDG_CONFIG_HOME/octolens/config.{json,jsonc,json5}` (default under `~/.config`)
 * 2. `octolens.config.{json,jsonc,json5}` in the working directory, or its
 * `package.json`'s `"octolens"` key.
 *
 * Every source is optional, but each location accepts at most one:
 * finding several (e.g. a `.json` and a `.jsonc`, or a config file next
 * to a populated `package.json` key) is an error rather than a silent
 * pick. Locations merge per key with the project source winning;
 * `rules` entries merge by rule ID, arrays are replaced wholesale.
 * `.json` files parse as strict JSON, `.jsonc` adds comments and
 * trailing commas, `.json5` follows the JSON5 spec. Each source is
 * validated strictly against {@link OctolensConfig} — unknown keys and
 * wrong types are rejected so typos never silently disable a check.
 *
 * @param    options - Optional overrides for discovery locations.
 * @returns          The merged configuration and the sources it came from.
 * @throws {ConfigError} If a source is unreadable, malformed, invalid, or ambiguous.
 */
export function loadConfig(options: LoadConfigOptions = {}): LoadedConfig {
	const cwd = options.cwd ?? process.cwd();
	const env = options.env ?? process.env;
	const home = options.home ?? homedir();

	// Per the XDG spec, a relative XDG_CONFIG_HOME is ignored.
	const xdg = env.XDG_CONFIG_HOME;
	const configHome = xdg !== undefined && xdg.trim() !== '' && isAbsolute(xdg) ?
		xdg :
		join(home, '.config');

	const locations: { candidates: string[]; pkgPath?: string; }[] = [
		{ candidates: HOME_CONFIG_FILES.map((name) => join(configHome, 'octolens', name)) },
		{
			candidates: PROJECT_CONFIG_FILES.map((name) => join(cwd, name)),
			pkgPath: join(cwd, 'package.json'),
		},
	];

	let config: OctolensConfig = {};
	const sources: string[] = [];

	for (const location of locations) {
		const loaded = loadLocation(location.candidates, location.pkgPath);

		if (loaded === undefined) continue;

		config = mergeConfigs(config, loaded.config);
		sources.push(loaded.source);
	}

	return { config, sources };
}

/**
 * Load the single config source of one location.
 *
 * @param    candidates - Dedicated config file paths to consider.
 * @param    pkgPath    - Optional `package.json` whose `octolens` key also counts.
 * @returns             The validated config and its source label, or `undefined`.
 * @throws {ConfigError} If several sources exist, or the one found is invalid.
 */
function loadLocation(
	candidates: string[],
	pkgPath?: string,
): { config: OctolensConfig; source: string; } | undefined {
	const files: { path: string; raw: string; }[] = [];

	for (const path of candidates) {
		const raw = readConfigFile(path);

		if (raw !== undefined) files.push({ path, raw });
	}

	const pkg = pkgPath === undefined ?
		undefined :
		readPackageJsonSource(pkgPath);

	const labels = [
		...files.map((f) => f.path),
		...pkg === undefined ?
			[] :
			[ pkg.label ],
	];

	if (labels.length > 1) {
		const message = 'multiple config sources found (keep exactly one): ' +
			labels.join(', ');

		throw new ConfigError(message);
	}

	const file = files[0];

	if (file !== undefined) {
		return {
			config: validateConfig(parseSource(file.raw, file.path), file.path),
			source: file.path,
		};
	}

	if (pkg !== undefined) {
		return { config: validateConfig(pkg.value, pkg.label), source: pkg.label };
	}

	return undefined;
}

/**
 * Read the `octolens` key of a `package.json`, when present.
 *
 * A missing file or a file without the key is not a config source; a
 * `package.json` that cannot be read or parsed is an error, since the
 * key's presence cannot be determined.
 *
 * @param    pkgPath - Path to the `package.json`.
 * @returns          The key's raw value and a source label, or `undefined`.
 * @throws {ConfigError} If the file exists but cannot be read or parsed.
 */
function readPackageJsonSource(pkgPath: string): { label: string; value: unknown; } | undefined {
	const raw = readConfigFile(pkgPath);

	if (raw === undefined) return undefined;

	const pkg = parseJson(raw, pkgPath);

	if (typeof pkg !== 'object' || pkg === null || Array.isArray(pkg)) {
		return undefined;
	}

	const value = (pkg as Record<string, unknown>).octolens;

	if (value === undefined) return undefined;

	return { label: `${pkgPath}#octolens`, value };
}

/**
 * Parse a config file's contents with the grammar its extension declares.
 *
 * @param    raw  - File contents.
 * @param    path - File path; the extension selects the parser.
 * @returns       The parsed value.
 * @throws {ConfigError} If the contents do not match the grammar.
 */
function parseSource(raw: string, path: string): unknown {
	if (path.endsWith('.jsonc')) return parseJsonc(raw, path);
	if (path.endsWith('.json5')) return parseJson5(raw, path);

	return parseJson(raw, path);
}

/**
 * Read a config file, treating a missing file as "no config".
 *
 * The path is stat'ed first: anything that is not a regular file (a
 * directory, a FIFO, a socket) is rejected up front — reading a FIFO
 * would block the process forever.
 *
 * @param    path - File path to read.
 * @returns       The file contents, or `undefined` when the file does not exist.
 * @throws {ConfigError} If the path exists but is not a readable regular file.
 */
function readConfigFile(path: string): string | undefined {
	try {
		if (!statSync(path).isFile()) {
			throw new ConfigError(`${path}: cannot read config file (not a regular file)`);
		}

		return readFileSync(path, 'utf8');
	} catch (err) {
		if (err instanceof ConfigError) throw err;

		const code = (err as NodeJS.ErrnoException).code;

		if (code === 'ENOENT' || code === 'ENOTDIR') {
			return undefined;
		}

		throw new ConfigError(`${path}: cannot read config file (${(err as Error).message})`);
	}
}

/**
 * Strip a UTF-8 BOM (common from Windows editors); `JSON.parse` rejects it.
 *
 * @param raw - File contents.
 * @returns   The contents without a leading BOM.
 */
function stripBom(raw: string): string {
	return raw.replace(/^﻿/, '');
}

/**
 * Parse a config file's contents as strict JSON.
 *
 * @param    raw  - File contents.
 * @param    path - File path, for error messages.
 * @returns       The parsed value.
 * @throws {ConfigError} If the contents are not valid JSON.
 */
function parseJson(raw: string, path: string): unknown {
	try {
		return JSON.parse(stripBom(raw)) as unknown;
	} catch (err) {
		throw new ConfigError(`${path}: invalid JSON (${(err as Error).message})`);
	}
}

/**
 * Parse a config file's contents as JSONC: strict JSON plus comments
 * and trailing commas, nothing more.
 *
 * `jsonc-parser` is fault tolerant — it returns a best-effort value and
 * collects errors instead of throwing — so the error list is the
 * authority, not the returned value.
 *
 * @param    raw  - File contents.
 * @param    path - File path, for error messages.
 * @returns       The parsed value.
 * @throws {ConfigError} If the contents are not valid JSONC.
 */
function parseJsonc(raw: string, path: string): unknown {
	const text = stripBom(raw);
	const errors: ParseError[] = [];
	const value: unknown = parseJsoncText(text, errors, { allowTrailingComma: true });

	const first = errors[0];

	if (first !== undefined) {
		const { line, column } = positionAt(text, first.offset);
		const message = `${path}: invalid JSONC ` +
			`(${printParseErrorCode(first.error)} at ${line}:${column})`;

		throw new ConfigError(message);
	}

	return value;
}

/**
 * Parse a config file's contents as JSON5.
 *
 * @param    raw  - File contents.
 * @param    path - File path, for error messages.
 * @returns       The parsed value.
 * @throws {ConfigError} If the contents are not valid JSON5.
 */
function parseJson5(raw: string, path: string): unknown {
	try {
		// JSON5's own errors already carry "at line:column".
		return JSON5.parse(stripBom(raw)) as unknown;
	} catch (err) {
		throw new ConfigError(`${path}: invalid JSON5 (${(err as Error).message})`);
	}
}

/**
 * Translate a character offset into a 1-based line and column.
 *
 * @param text   - Document the offset points into.
 * @param offset - Character offset.
 * @returns      The 1-based line and column of the offset.
 */
function positionAt(text: string, offset: number): { line: number; column: number; } {
	const before = text.slice(0, offset);
	const line = before.split('\n').length;
	const column = offset - before.lastIndexOf('\n');

	return { line, column };
}

/**
 * Validate a parsed config file strictly against {@link OctolensConfig}.
 *
 * @param    value - Parsed JSON value.
 * @param    path  - File path, for error messages.
 * @returns        The validated configuration.
 * @throws {ConfigError} On unknown keys or values of the wrong type.
 */
function validateConfig(value: unknown, path: string): OctolensConfig {
	const root = expectObject(value, path, 'config');

	rejectUnknownKeys(root, path, '', [
		'rules',
		'ignore',
		'org',
	]);

	const config: OctolensConfig = {};

	if (root.rules !== undefined) {
		config.rules = validateRules(root.rules, path);
	}

	if (root.ignore !== undefined) {
		config.ignore = validateIgnore(root.ignore, path);
	}

	if (root.org !== undefined) {
		config.org = validateOrg(root.org, path);
	}

	return config;
}

/**
 * Validate the `rules` section: rule ID → severity or `'off'`.
 *
 * @param    value - Parsed `rules` value.
 * @param    path  - File path, for error messages.
 * @returns        The validated rule overrides.
 * @throws {ConfigError} On a non-object section or invalid override values.
 */
function validateRules(value: unknown, path: string): NonNullable<OctolensConfig['rules']> {
	const section = expectObject(value, path, 'rules');
	const entries: [string, Severity | 'off'][] = [];

	for (const [ id, setting ] of Object.entries(section)) {
		if (typeof setting !== 'string' || (setting !== 'off' && !isSeverity(setting))) {
			const message = `${path}: "rules.${id}" must be one of ` +
				`${RULE_SETTING_VALUES}, got ${show(setting)}`;

			throw new ConfigError(message);
		}
		entries.push([ id, setting ]);
	}

	/*
	 * fromEntries defines own properties, so exotic IDs like "__proto__"
	 * are stored instead of silently hitting the prototype accessor.
	 */
	return Object.fromEntries(entries);
}

/**
 * Validate the `ignore` section.
 *
 * @param    value - Parsed `ignore` value.
 * @param    path  - File path, for error messages.
 * @returns        The validated ignore filters.
 * @throws {ConfigError} On unknown keys or values of the wrong type.
 */
function validateIgnore(value: unknown, path: string): NonNullable<OctolensConfig['ignore']> {
	const section = expectObject(value, path, 'ignore');

	rejectUnknownKeys(section, path, 'ignore', [
		'repos',
		'archived',
		'forks',
	]);

	const ignore: NonNullable<OctolensConfig['ignore']> = {};

	if (section.repos !== undefined) {
		if (!Array.isArray(section.repos) || section.repos.some((r) => typeof r !== 'string')) {
			const message = `${path}: "ignore.repos" must be an array of ` +
				`"owner/name" strings, got ${show(section.repos)}`;

			throw new ConfigError(message);
		}
		ignore.repos = section.repos as string[];
	}

	if (section.archived !== undefined) {
		ignore.archived = expectBoolean(section.archived, path, 'ignore.archived');
	}

	if (section.forks !== undefined) {
		ignore.forks = expectBoolean(section.forks, path, 'ignore.forks');
	}

	return ignore;
}

/**
 * Validate the `org` section.
 *
 * @param    value - Parsed `org` value.
 * @param    path  - File path, for error messages.
 * @returns        The validated org settings.
 * @throws {ConfigError} On unknown keys or values of the wrong type.
 */
function validateOrg(value: unknown, path: string): NonNullable<OctolensConfig['org']> {
	const section = expectObject(value, path, 'org');

	rejectUnknownKeys(section, path, 'org', [ 'concurrency' ]);

	const org: NonNullable<OctolensConfig['org']> = {};

	if (section.concurrency !== undefined) {
		const n = section.concurrency;

		if (typeof n !== 'number' || !Number.isInteger(n) || n < 1 || n > MAX_CONCURRENCY) {
			const message = `${path}: "org.concurrency" must be an integer ` +
				`between 1 and ${MAX_CONCURRENCY}, got ${show(n)}`;

			throw new ConfigError(message);
		}
		org.concurrency = n;
	}

	return org;
}

/**
 * Assert a value is a plain JSON object.
 *
 * @param    value - Value to check.
 * @param    path  - File path, for error messages.
 * @param    label - Key label, for error messages.
 * @returns        The value, typed as a record.
 * @throws {ConfigError} If the value is not an object.
 */
function expectObject(value: unknown, path: string, label: string): Record<string, unknown> {
	if (typeof value !== 'object' || value === null || Array.isArray(value)) {
		throw new ConfigError(`${path}: "${label}" must be an object, got ${show(value)}`);
	}

	return value as Record<string, unknown>;
}

/**
 * Assert a value is a boolean.
 *
 * @param    value - Value to check.
 * @param    path  - File path, for error messages.
 * @param    label - Key label, for error messages.
 * @returns        The boolean value.
 * @throws {ConfigError} If the value is not a boolean.
 */
function expectBoolean(value: unknown, path: string, label: string): boolean {
	if (typeof value !== 'boolean') {
		throw new ConfigError(`${path}: "${label}" must be a boolean, got ${show(value)}`);
	}

	return value;
}

/**
 * Reject keys that are not part of the schema, so typos fail loudly
 * instead of silently doing nothing.
 *
 * @param  section - Object to check.
 * @param  path    - File path, for error messages.
 * @param  prefix  - Section prefix for key labels; empty at the root.
 * @param  known   - Keys the schema allows.
 * @throws {ConfigError} If the object has a key outside `known`.
 */
function rejectUnknownKeys(
	section: Record<string, unknown>,
	path: string,
	prefix: string,
	known: string[],
): void {
	for (const key of Object.keys(section)) {
		if (!known.includes(key)) {
			const label = prefix === '' ?
				key :
				`${prefix}.${key}`;
			const message = `${path}: unknown key "${label}" ` +
				`(expected one of: ${known.join(', ')})`;

			throw new ConfigError(message);
		}
	}
}

/**
 * Merge two validated configs, the override winning per key. `rules`
 * entries merge by rule ID; arrays are replaced, not concatenated.
 *
 * @param base     - Lower-priority configuration.
 * @param override - Higher-priority configuration.
 * @returns        The merged configuration.
 */
function mergeConfigs(base: OctolensConfig, override: OctolensConfig): OctolensConfig {
	const merged: OctolensConfig = {};

	if (base.rules !== undefined || override.rules !== undefined) {
		merged.rules = { ...base.rules, ...override.rules };
	}

	if (base.ignore !== undefined || override.ignore !== undefined) {
		merged.ignore = { ...base.ignore, ...override.ignore };
	}

	if (base.org !== undefined || override.org !== undefined) {
		merged.org = { ...base.org, ...override.org };
	}

	return merged;
}

/**
 * Render an offending value for an error message, truncated to keep
 * messages readable.
 *
 * @param value - Value to render.
 * @returns     A short JSON rendering of the value.
 */
function show(value: unknown): string {
	const rendered = JSON.stringify(value) ?? String(value);

	return rendered.length > 60 ?
		`${rendered.slice(0, 57)}...` :
		rendered;
}
