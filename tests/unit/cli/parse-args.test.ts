import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, CliUsageError } from '../../../src/cli/parse-args.ts';

test('parses minimal scan invocation', testParsesMinimal);

function testParsesMinimal() {
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
}

test('repeatable --format collects values', testRepeatableFormat);

function testRepeatableFormat() {
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
}

test('invalid severity is rejected', testInvalidSeverity);

function testInvalidSeverity() {
	assert.throws(
		invalidSeverityCall,
		CliUsageError,
	);
}

function invalidSeverityCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--severity',
		'meh',
	]);
}

test('missing --repo is rejected', testMissingRepo);

function testMissingRepo() {
	assert.throws(missingRepoCall, CliUsageError);
}

function missingRepoCall() {
	parseArgs([ 'scan' ]);
}

test('--help short-circuits', testHelp);

function testHelp() {
	const result = parseArgs([ '--help' ]);

	assert.equal(result.command, 'help');
}

test('--version short-circuits', testVersion);

function testVersion() {
	const result = parseArgs([ '--version' ]);

	assert.equal(result.command, 'version');
}

test('malformed --repo fails', testMalformedRepo);

function testMalformedRepo() {
	assert.throws(malformedRepoCall, CliUsageError);
}

function malformedRepoCall() {
	parseArgs([
		'scan',
		'--repo',
		'no-slash',
	]);
}

test('--allow-public and --allow-internal collect repeatable values', testAllowFlags);

function testAllowFlags() {
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
	assert.deepEqual(result.allowPublic, [ 'sheplu/octolens', 'sheplu/public-docs' ]);
	assert.deepEqual(result.allowInternal, [ 'sheplu/internal-lib' ]);
}

test('malformed --allow-public is rejected', testMalformedAllow);

function testMalformedAllow() {
	assert.throws(malformedAllowCall, CliUsageError);
}

function malformedAllowCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--allow-public',
		'no-slash',
	]);
}

test('-v short-circuits to version', testShortVersion);

function testShortVersion() {
	const result = parseArgs([ '-v' ]);

	assert.equal(result.command, 'version');
}

test('empty argv returns help', testEmptyArgv);

function testEmptyArgv() {
	const result = parseArgs([]);

	assert.equal(result.command, 'help');
}

test('--token is parsed', testToken);

function testToken() {
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
}

test('--out is parsed', testOut);

function testOut() {
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
}

test('--verbose sets verbose flag', testVerbose);

function testVerbose() {
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
}

test('--include-archived sets includeArchived flag', testIncludeArchived);

function testIncludeArchived() {
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
}

test('unknown option is rejected', testUnknownOption);

function testUnknownOption() {
	assert.throws(unknownOptionCall, CliUsageError);
}

function unknownOptionCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--bogus',
	]);
}

test('unknown format is rejected', testUnknownFormat);

function testUnknownFormat() {
	assert.throws(unknownFormatCall, CliUsageError);
}

function unknownFormatCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--format',
		'csv',
	]);
}

test('--org parses an organization scan', testOrg);

function testOrg() {
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
}

test('--repo and --org together are rejected', testRepoAndOrg);

function testRepoAndOrg() {
	assert.throws(repoAndOrgCall, CliUsageError);
}

function repoAndOrgCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--org',
		'c',
	]);
}

test('--org with a slash is rejected', testMalformedOrg);

function testMalformedOrg() {
	assert.throws(malformedOrgCall, CliUsageError);
}

function malformedOrgCall() {
	parseArgs([
		'scan',
		'--org',
		'owner/name',
	]);
}

test('--org with repo-only flags is rejected', testOrgWithRepoFlags);

function testOrgWithRepoFlags() {
	assert.throws(orgWithArchivedCall, CliUsageError);
	assert.throws(orgWithAllowPublicCall, CliUsageError);
}

function orgWithArchivedCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--include-archived',
	]);
}

function orgWithAllowPublicCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--allow-public',
		'a/b',
	]);
}

test('--org with --fail-on-skip is accepted', testOrgFailOnSkip);

function testOrgFailOnSkip() {
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
}

test('--all-repos parses with --org', testAllRepos);

function testAllRepos() {
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
}

test('--all-repos without --org is rejected', testAllReposWithoutOrg);

function testAllReposWithoutOrg() {
	assert.throws(allReposAloneCall, CliUsageError);
	assert.throws(allReposWithRepoCall, CliUsageError);
}

function allReposAloneCall() {
	parseArgs([ 'scan', '--all-repos' ]);
}

function allReposWithRepoCall() {
	parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--all-repos',
	]);
}

test('--concurrency parses a bounded integer', testConcurrency);

function testConcurrency() {
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
}

test('invalid --concurrency values are rejected', testInvalidConcurrency);

function testInvalidConcurrency() {
	assert.throws(concurrencyZeroCall, CliUsageError);
	assert.throws(concurrencyTooHighCall, CliUsageError);
	assert.throws(concurrencyNonIntegerCall, CliUsageError);
}

function concurrencyZeroCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--all-repos',
		'--concurrency',
		'0',
	]);
}

function concurrencyTooHighCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--all-repos',
		'--concurrency',
		'33',
	]);
}

function concurrencyNonIntegerCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--all-repos',
		'--concurrency',
		'2.5',
	]);
}

test('--concurrency without --all-repos is rejected', testConcurrencyWithoutAllRepos);

function testConcurrencyWithoutAllRepos() {
	assert.throws(concurrencyAloneCall, CliUsageError);
}

function concurrencyAloneCall() {
	parseArgs([
		'scan',
		'--org',
		'a',
		'--concurrency',
		'4',
	]);
}

test('--org --all-repos accepts repo-scoped flags', testAllReposWithRepoFlags);

function testAllReposWithRepoFlags() {
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
}

test('--fail-on-skip defaults to false and is set by the flag', testFailOnSkip);

function testFailOnSkip() {
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

	if (withoutFlag.command !== 'scan' || withFlag.command !== 'scan') {
		throw new Error('expected scan');
	}
	assert.equal(withoutFlag.failOnSkip, false);
	assert.equal(withFlag.failOnSkip, true);
}

test('unknown command is rejected', testUnknownCommand);

function testUnknownCommand() {
	assert.throws(unknownCommandCall, CliUsageError);
}

function unknownCommandCall() {
	parseArgs([ 'audit' ]);
}

test('--help inside a scan invocation wins', testInlineHelp);

function testInlineHelp() {
	const result = parseArgs([
		'scan',
		'--repo',
		'a/b',
		'--help',
	]);

	assert.deepEqual(result, { command: 'help' });
}

test('a flag at the end without its value is rejected', testMissingTrailingValue);

function testMissingTrailingValue() {
	assert.throws(missingTrailingValueCall, CliUsageError);
}

function missingTrailingValueCall() {
	parseArgs([ 'scan', '--repo' ]);
}

test('a flag whose value looks like another flag is rejected', testDashValue);

function testDashValue() {
	assert.throws(dashValueCall, CliUsageError);
}

function dashValueCall() {
	parseArgs([
		'scan',
		'--repo',
		'--verbose',
	]);
}
