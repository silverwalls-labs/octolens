import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import fc from 'fast-check';
import { parseArgs, CliUsageError } from '../../src/cli/parse-args.ts';
import { isSeverity } from '../../src/types/index.ts';
import { arbArgv, fuzzParams } from '../helpers/arbitraries.ts';

const COMMANDS = [
	'scan',
	'help',
	'version',
];
const FORMATS = [
	'pretty',
	'json',
	'md',
];

describe('parseArgs fuzz', () => {
	test('parseArgs yields a valid command or a usage error', () => {
		fc.assert(fc.property(arbArgv, (argv: string[]): void => {
			let result;

			try {
				result = parseArgs(argv);
			} catch (err) {
				// The only error a caller ever sees is a usage error.
				assert.ok(err instanceof CliUsageError);
				assert.ok(err.message.length > 0);

				return;
			}

			assert.ok(COMMANDS.includes(result.command));

			if (result.command !== 'scan') {
				return;
			}

			// Exactly one target is set.
			const hasRepo = result.repo !== undefined;
			const hasOrg = result.org !== undefined;

			assert.notEqual(hasRepo, hasOrg);

			if (result.repo !== undefined) {
				assert.ok(result.repo.owner.length > 0);
				assert.ok(result.repo.name.length > 0);
			}

			if (hasOrg) {
				assert.ok(!(result.org as string).includes('/'));
			}

			assert.ok(result.formats.length > 0);

			for (const format of result.formats) {
				assert.ok(FORMATS.includes(format));
			}

			assert.ok(isSeverity(result.severity));

			if (result.concurrency !== undefined) {
				assert.ok(result.concurrency >= 1);
				assert.ok(result.concurrency <= 32);
				assert.equal(result.allRepos, true);
			}

			if (result.allRepos) {
				assert.equal(hasOrg, true);
			}
		}), fuzzParams);
	});
});
