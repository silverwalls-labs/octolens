import { isSeverity, type Severity } from '../types/severity.ts';

/** Supported output format. */
export type Format = 'pretty' | 'json' | 'md';

export type ScanCommandArgs = {
	command: 'scan';

	/** Target repository. Exactly one of `repo` and `org` is set. */
	repo?: { owner: string; name: string; };

	/** Target organisation. Exactly one of `repo` and `org` is set. */
	org?: string;

	/** Also scan every repository of the organisation (requires `org`). */
	allRepos: boolean;

	/** Repositories scanned concurrently during fan-out (requires `allRepos`). */
	concurrency?: number;
	token?: string;
	formats: Format[];
	out?: string;
	severity: Severity;
	verbose: boolean;
	includeArchived: boolean;
	allowPublic: string[];
	allowInternal: string[];
	failOnSkip: boolean;
};

export type HelpArgs = { command: 'help'; };
export type VersionArgs = { command: 'version'; };

export type ParsedArgs = ScanCommandArgs | HelpArgs | VersionArgs;

/** Thrown on invalid CLI usage (bad flags, missing required options). */
export class CliUsageError extends Error {
	constructor(message: string) {
		super(message);
		this.name = 'CliUsageError';
	}
}

/**
 * Parse raw CLI arguments into a typed command object.
 *
 * @param argv - Arguments after the `scan` subcommand.
 * @returns A discriminated union: `ScanCommandArgs`, `HelpArgs`, or `VersionArgs`.
 * @throws {CliUsageError} On unrecognised options, missing values, or invalid formats.
 */
export function parseArgs(argv: string[]): ParsedArgs {
	if (argv.length === 0 || argv[0] === '-h' || argv[0] === '--help') {
		return { command: 'help' };
	}
	if (argv[0] === '-v' || argv[0] === '--version') {
		return { command: 'version' };
	}

	if (argv[0] !== 'scan') {
		throw new CliUsageError(`Unknown command: ${argv[0]}`);
	}

	let repoSpec: string | undefined;
	let orgSpec: string | undefined;
	let allRepos = false;
	let concurrency: number | undefined;
	let token: string | undefined;
	let out: string | undefined;
	let severityRaw = 'high';
	let verbose = false;
	let includeArchived = false;
	let failOnSkip = false;
	const formats: Format[] = [];
	const allowPublic: string[] = [];
	const allowInternal: string[] = [];

	for (let i = 1; i < argv.length; i++) {
		const arg = argv[i];

		switch (arg) {
			case '--repo':
				repoSpec = readValue(argv, ++i, arg);
				break;
			case '--org':
				orgSpec = readValue(argv, ++i, arg);
				break;
			case '--all-repos':
				allRepos = true;
				break;
			case '--concurrency':
				concurrency = parseConcurrency(readValue(argv, ++i, arg));
				break;
			case '--token':
				token = readValue(argv, ++i, arg);
				break;
			case '--format':
				formats.push(parseFormat(readValue(argv, ++i, arg)));
				break;
			case '--out':
				out = readValue(argv, ++i, arg);
				break;
			case '--severity':
				severityRaw = readValue(argv, ++i, arg);
				break;
			case '--verbose':
				verbose = true;
				break;
			case '--include-archived':
				includeArchived = true;
				break;
			case '--fail-on-skip':
				failOnSkip = true;
				break;
			case '--allow-public':
				allowPublic.push(parseAllowSpec(readValue(argv, ++i, arg), arg));
				break;
			case '--allow-internal':
				allowInternal.push(parseAllowSpec(readValue(argv, ++i, arg), arg));
				break;
			case '-h':
			case '--help':
				return { command: 'help' };
			default:
				throw new CliUsageError(`Unknown option: ${arg}`);
		}
	}

	if (repoSpec && orgSpec) {
		throw new CliUsageError('--repo and --org are mutually exclusive.');
	}

	if (!repoSpec && !orgSpec) {
		throw new CliUsageError('Either --repo <owner/name> or --org <organization> is required.');
	}

	if (orgSpec && orgSpec.includes('/')) {
		const message = `Invalid --org "${orgSpec}". ` +
			'Expected an organization login without "/".';

		throw new CliUsageError(message);
	}

	if (allRepos && !orgSpec) {
		throw new CliUsageError('--all-repos requires --org.');
	}

	if (concurrency !== undefined && !allRepos) {
		throw new CliUsageError('--concurrency requires --all-repos.');
	}

	if (orgSpec && !allRepos &&
		(includeArchived || allowPublic.length > 0 || allowInternal.length > 0)) {
		const message = '--include-archived, --allow-public and --allow-internal ' +
			'only apply to --repo scans and --org --all-repos scans.';

		throw new CliUsageError(message);
	}

	if (!isSeverity(severityRaw)) {
		throw new CliUsageError(`Invalid --severity value: ${severityRaw}`);
	}

	return {
		command: 'scan',
		repo: repoSpec ?
			parseRepoSpec(repoSpec) :
			undefined,
		org: orgSpec,
		allRepos,
		concurrency,
		token,
		formats: formats.length > 0 ?
			formats :
			[ 'pretty' ],
		out,
		severity: severityRaw,
		verbose,
		includeArchived,
		allowPublic,
		allowInternal,
		failOnSkip,
	};
}

function readValue(argv: string[], index: number, flag: string): string {
	const value = argv[index];

	if (value === undefined || value.startsWith('-')) {
		throw new CliUsageError(`Missing value for ${flag}`);
	}

	return value;
}

function parseRepoSpec(spec: string): { owner: string; name: string; } {
	const slash = spec.indexOf('/');

	if (slash <= 0 || slash === spec.length - 1) {
		throw new CliUsageError(`Invalid --repo "${spec}". Expected "owner/name".`);
	}

	return { owner: spec.slice(0, slash), name: spec.slice(slash + 1) };
}

function parseAllowSpec(spec: string, flag: string): string {
	const slash = spec.indexOf('/');

	if (slash <= 0 || slash === spec.length - 1) {
		throw new CliUsageError(`Invalid ${flag} "${spec}". Expected "owner/name".`);
	}

	return spec.toLowerCase();
}

function parseConcurrency(value: string): number {
	const parsed = Number.parseInt(value, 10);

	if (!Number.isInteger(parsed) || String(parsed) !== value || parsed < 1 || parsed > 32) {
		const message = `Invalid --concurrency "${value}". ` +
			'Expected an integer between 1 and 32.';

		throw new CliUsageError(message);
	}

	return parsed;
}

function parseFormat(value: string): Format {
	if (value === 'pretty' || value === 'json' || value === 'md') {
		return value;
	}
	throw new CliUsageError(`Unknown --format "${value}". Supported: pretty, json, md.`);
}
