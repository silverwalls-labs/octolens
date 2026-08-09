import {
	test,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../src/cli/main.ts';

const stdoutChunks: string[] = [];
const stderrChunks: string[] = [];

const originalStdout = process.stdout.write.bind(process.stdout);
const originalStderr = process.stderr.write.bind(process.stderr);

function captureOutput() {
	process.stdout.write = function spy(chunk: string | Uint8Array): boolean {
		stdoutChunks.push(String(chunk));

		return true;
	};
	process.stderr.write = function spy(chunk: string | Uint8Array): boolean {
		stderrChunks.push(String(chunk));

		return true;
	};
}

afterEach(restoreOutput);

function restoreOutput() {
	process.stdout.write = originalStdout;
	process.stderr.write = originalStderr;
	stdoutChunks.length = 0;
	stderrChunks.length = 0;
}

test('--help prints help text and exits 0', helpCase);

async function helpCase() {
	captureOutput();

	const code = await main([ '--help' ]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /Usage:/);
}

test('-h is alias for --help', shortHelpCase);

async function shortHelpCase() {
	captureOutput();

	const code = await main([ '-h' ]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /Usage:/);
}

test('--version prints version and exits 0', versionCase);

async function versionCase() {
	captureOutput();

	const code = await main([ '--version' ]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /\d+\.\d+\.\d+/);
}

test('-v is alias for --version', shortVersionCase);

async function shortVersionCase() {
	captureOutput();

	const code = await main([ '-v' ]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /\d+\.\d+\.\d+/);
}

test('no args prints help and exits 0', noArgsCase);

async function noArgsCase() {
	captureOutput();

	const code = await main([]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /Usage:/);
}

test('scan without --repo exits 2', missingRepoCase);

async function missingRepoCase() {
	captureOutput();

	const code = await main([ 'scan' ]);

	assert.equal(code, 2);
}

test('unknown command exits 2', unknownCommandCase);

async function unknownCommandCase() {
	captureOutput();

	const code = await main([ 'bogus' ]);

	assert.equal(code, 2);
}

test('malformed --repo exits 2', malformedRepoCase);

async function malformedRepoCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'no-slash',
	]);

	assert.equal(code, 2);
}

test('invalid --severity exits 2', invalidSeverityCase);

async function invalidSeverityCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'a/b',
		'--severity',
		'bogus',
	]);

	assert.equal(code, 2);
}

test('unknown --format exits 2', unknownFormatCase);

async function unknownFormatCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'a/b',
		'--format',
		'csv',
	]);

	assert.equal(code, 2);
}

test('unknown option exits 2', unknownOptionCase);

async function unknownOptionCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'a/b',
		'--nope',
	]);

	assert.equal(code, 2);
}

test('--help inside scan exits 0', helpInsideScanCase);

async function helpInsideScanCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'a/b',
		'--help',
	]);

	assert.equal(code, 0);
	assert.match(stdoutChunks.join(''), /Usage:/);
}

test('error message is written to stderr', stderrCase);

async function stderrCase() {
	captureOutput();

	await main([ 'scan' ]);

	assert.ok(stderrChunks.length > 0);
	assert.match(stderrChunks.join(''), /--repo/);
}

test('help text lists all documented options', helpContentCase);

async function helpContentCase() {
	captureOutput();

	await main([ '--help' ]);
	const help = stdoutChunks.join('');

	assert.match(help, /--repo/);
	assert.match(help, /--token/);
	assert.match(help, /--format/);
	assert.match(help, /--severity/);
	assert.match(help, /--verbose/);
	assert.match(help, /--fail-on-skip/);
}

test('missing --token value exits 2', missingTokenValueCase);

async function missingTokenValueCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
		'a/b',
		'--token',
	]);

	assert.equal(code, 2);
}

test('--repo without value exits 2', repoWithoutValueCase);

async function repoWithoutValueCase() {
	captureOutput();

	const code = await main([
		'scan',
		'--repo',
	]);

	assert.equal(code, 2);
}
