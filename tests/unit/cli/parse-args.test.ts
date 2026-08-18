import { describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, CliUsageError } from '../../../src/cli/parse-args.ts';

describe('parseArgs', () => {
	test('parses minimal scan invocation', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'sheplu/Octolens',
		]);

		assert.equal(result.command, 'scan');
		if (result.command !== 'scan') {
			return;
		}
		assert.deepEqual(result.repo, { owner: 'sheplu', name: 'Octolens' });
		assert.deepEqual(result.formats, [ 'pretty' ]);
		assert.equal(result.severity, 'high');
	});

	test('repeatable --format collects values', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--format',
			'pretty',
			'--format',
			'json',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.deepEqual(result.formats, [ 'pretty', 'json' ]);
	});

	test('invalid severity is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--severity',
				'meh',
			]),
			CliUsageError,
		);
	});

	test('missing --repo is rejected', () => {
		assert.throws(
			() => parseArgs([ 'scan' ]),
			CliUsageError,
		);
	});

	test('--help short-circuits', () => {
		const result = parseArgs([ '--help' ]);

		assert.equal(result.command, 'help');
	});

	test('--version short-circuits', () => {
		const result = parseArgs([ '--version' ]);

		assert.equal(result.command, 'version');
	});

	test('malformed --repo fails', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'no-slash',
			]),
			CliUsageError,
		);
	});

	test(
		'--allow-public and --allow-internal collect repeatable values',
		() => {
			const result = parseArgs([
				'scan',
				'--repo',
				'sheplu/Octolens',
				'--allow-public',
				'sheplu/Octolens',
				'--allow-public',
				'sheplu/Public-Docs',
				'--allow-internal',
				'sheplu/Internal-Lib',
			]);

			if (result.command !== 'scan') {
				throw new Error('expected scan');
			}
			assert.deepEqual(
				result.allowPublic,
				[ 'sheplu/octolens', 'sheplu/public-docs' ],
			);
			assert.deepEqual(
				result.allowInternal,
				[ 'sheplu/internal-lib' ],
			);
		},
	);

	test('malformed --allow-public is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--allow-public',
				'no-slash',
			]),
			CliUsageError,
		);
	});

	test('-v short-circuits to version', () => {
		const result = parseArgs([ '-v' ]);

		assert.equal(result.command, 'version');
	});

	test('empty argv returns help', () => {
		const result = parseArgs([]);

		assert.equal(result.command, 'help');
	});

	test('--token is parsed', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--token',
			'ghp_abc123',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.token, 'ghp_abc123');
	});

	test('--out is parsed', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--out',
			'report.json',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.out, 'report.json');
	});

	test('--verbose sets verbose flag', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--verbose',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.verbose, true);
	});

	test('--include-archived sets includeArchived flag', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--include-archived',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.includeArchived, true);
	});

	test('unknown option is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--bogus',
			]),
			CliUsageError,
		);
	});

	test('unknown format is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--format',
				'csv',
			]),
			CliUsageError,
		);
	});

	test('--org parses an organization scan', () => {
		const result = parseArgs([
			'scan',
			'--org',
			'silverwalls-labs',
		]);

		assert.equal(result.command, 'scan');
		if (result.command !== 'scan') {
			return;
		}
		assert.equal(result.org, 'silverwalls-labs');
		assert.equal(result.repo, undefined);
	});

	test('--repo and --org together are rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--org',
				'c',
			]),
			CliUsageError,
		);
	});

	test('--org with a slash is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'owner/name',
			]),
			CliUsageError,
		);
	});

	test('--org with repo-only flags is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--include-archived',
			]),
			CliUsageError,
		);
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--allow-public',
				'a/b',
			]),
			CliUsageError,
		);
	});

	test('--org with --fail-on-skip is accepted', () => {
		const result = parseArgs([
			'scan',
			'--org',
			'a',
			'--fail-on-skip',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.failOnSkip, true);
	});

	test('--all-repos parses with --org', () => {
		const withoutFlag = parseArgs([
			'scan',
			'--org',
			'silverwalls-labs',
		]);
		const withFlag = parseArgs([
			'scan',
			'--org',
			'silverwalls-labs',
			'--all-repos',
		]);

		if (withoutFlag.command !== 'scan' || withFlag.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(withoutFlag.allRepos, false);
		assert.equal(withFlag.allRepos, true);
	});

	test('--all-repos without --org is rejected', () => {
		assert.throws(
			() => parseArgs([ 'scan', '--all-repos' ]),
			CliUsageError,
		);
		assert.throws(
			() => parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--all-repos',
			]),
			CliUsageError,
		);
	});

	test('--concurrency parses a bounded integer', () => {
		const result = parseArgs([
			'scan',
			'--org',
			'a',
			'--all-repos',
			'--concurrency',
			'8',
		]);

		if (result.command !== 'scan') {
			throw new Error('expected scan');
		}
		assert.equal(result.concurrency, 8);
	});

	test('invalid --concurrency values are rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--all-repos',
				'--concurrency',
				'0',
			]),
			CliUsageError,
		);
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--all-repos',
				'--concurrency',
				'33',
			]),
			CliUsageError,
		);
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--all-repos',
				'--concurrency',
				'2.5',
			]),
			CliUsageError,
		);
	});

	test('--concurrency without --all-repos is rejected', () => {
		assert.throws(
			() => parseArgs([
				'scan',
				'--org',
				'a',
				'--concurrency',
				'4',
			]),
			CliUsageError,
		);
	});

	test(
		'--org --all-repos accepts repo-scoped flags',
		() => {
			const result = parseArgs([
				'scan',
				'--org',
				'a',
				'--all-repos',
				'--include-archived',
				'--allow-public',
				'a/b',
				'--allow-internal',
				'a/c',
			]);

			if (result.command !== 'scan') {
				throw new Error('expected scan');
			}
			assert.equal(result.includeArchived, true);
			assert.deepEqual(result.allowPublic, [ 'a/b' ]);
			assert.deepEqual(result.allowInternal, [ 'a/c' ]);
		},
	);

	test(
		'--fail-on-skip defaults to false and is set by the flag',
		() => {
			const withoutFlag = parseArgs([
				'scan',
				'--repo',
				'a/b',
			]);
			const withFlag = parseArgs([
				'scan',
				'--repo',
				'a/b',
				'--fail-on-skip',
			]);

			if (
				withoutFlag.command !== 'scan' ||
				withFlag.command !== 'scan'
			) {
				throw new Error('expected scan');
			}
			assert.equal(withoutFlag.failOnSkip, false);
			assert.equal(withFlag.failOnSkip, true);
		},
	);

	test('unknown command is rejected', () => {
		assert.throws(
			() => parseArgs([ 'audit' ]),
			CliUsageError,
		);
	});

	test('--help inside a scan invocation wins', () => {
		const result = parseArgs([
			'scan',
			'--repo',
			'a/b',
			'--help',
		]);

		assert.deepEqual(result, { command: 'help' });
	});

	test(
		'a flag at the end without its value is rejected',
		() => {
			assert.throws(
				() => parseArgs([ 'scan', '--repo' ]),
				CliUsageError,
			);
		},
	);

	test(
		'a flag whose value looks like another flag is rejected',
		() => {
			assert.throws(
				() => parseArgs([
					'scan',
					'--repo',
					'--verbose',
				]),
				CliUsageError,
			);
		},
	);
});
