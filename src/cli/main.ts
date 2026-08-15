import { writeFileSync } from 'node:fs';
import { resolveAuth, AuthError } from '../github/auth.ts';
import { createOctokit } from '../github/client.ts';
import {
	createLogger, scanRepo, scanOrg, exitCodeFor,
} from '../engine/index.ts';
import { allRules, allOrgRules } from '../rules/index.ts';
import {
	formatJson, formatMarkdown, formatPretty,
} from '../output/index.ts';
import type { ScanResult } from '../types/index.ts';
import {
	parseArgs, CliUsageError, type Format, type ScanCommandArgs,
} from './parse-args.ts';
import { HELP_TEXT } from './help.ts';
import { readVersion } from './version.ts';

/**
 * CLI entry point.
 *
 * Parses `argv`, dispatches to the appropriate command (help, version,
 * or scan), and returns the exit code.
 *
 * @param argv - Raw command-line arguments (without `node` and script path).
 * @returns Exit code: `0` on success, `1` on findings, `2` on usage error.
 */
export async function main(argv: string[]): Promise<number> {
	let parsed;

	try {
		parsed = parseArgs(argv);
	} catch (err) {
		if (err instanceof CliUsageError) {
			process.stderr.write(`${err.message}\n\n${HELP_TEXT}`);

			return 2;
		}
		throw err;
	}

	if (parsed.command === 'help') {
		process.stdout.write(HELP_TEXT);

		return 0;
	}

	if (parsed.command === 'version') {
		process.stdout.write(`${readVersion()}\n`);

		return 0;
	}

	return runScanCommand(parsed);
}

async function runScanCommand(args: ScanCommandArgs): Promise<number> {
	const logger = createLogger(args.verbose ?
		'debug' :
		'warn');

	let auth;

	try {
		auth = resolveAuth({ token: args.token });
	} catch (err) {
		if (err instanceof AuthError) {
			process.stderr.write(`${err.message}\n`);

			return 2;
		}
		throw err;
	}
	logger.debug(`auth source: ${auth.source}`);

	const octokit = createOctokit({
		token: auth.token,
		userAgent: `octolens/${readVersion()}`,
		logger,
	});

	const result = args.org !== undefined ?
		await scanOrg({
			org: args.org,
			rules: [ ...allOrgRules ],
			octokit,
			logger,
			threshold: args.severity,
		}) :
		await scanRepo({
			// parseArgs guarantees exactly one of repo/org is set.
			repo: args.repo as { owner: string; name: string; },
			rules: [ ...allRules ],
			octokit,
			logger,
			threshold: args.severity,
			config: { ignore: { archived: !args.includeArchived } },
			ruleConfig: {
				'access/visibility-private-default': {
					allowPublic: args.allowPublic,
					allowInternal: args.allowInternal,
				},
			},
		});

	emitOutput(result, args.formats, args.out);

	return exitCodeFor(result, { failOnIncomplete: args.failOnSkip });
}

function emitOutput(result: ScanResult, formats: Format[], out: string | undefined): void {
	for (const format of formats) {
		const rendered = render(result, format);

		if (out && format === formats[formats.length - 1]) {
			writeFileSync(out, rendered);
		} else {
			process.stdout.write(rendered);
		}
	}
}

function render(result: ScanResult, format: Format): string {
	switch (format) {
		case 'json':
			return formatJson(result);
		case 'md':
			return formatMarkdown(result);
		default:
			return formatPretty(result);
	}
}
