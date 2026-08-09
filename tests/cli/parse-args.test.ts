import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseArgs, CliUsageError } from '../../src/cli/parse-args.ts';

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
