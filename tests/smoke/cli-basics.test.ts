import {
	describe,
	test,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../../src/cli/main.ts';
import { captureOutput, restoreOutput } from '../helpers/context.ts';

describe('cli basics', () => {
	afterEach(restoreOutput);

	test('--help prints help text and exits 0', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([ '--help' ]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /Usage:/);
	});

	test('-h is alias for --help', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([ '-h' ]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /Usage:/);
	});

	test('--version prints version and exits 0', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([ '--version' ]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /\d+\.\d+\.\d+/);
	});

	test('-v is alias for --version', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([ '-v' ]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /\d+\.\d+\.\d+/);
	});

	test('no args prints help and exits 0', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /Usage:/);
	});

	test('scan without --repo exits 2', async () => {
		captureOutput();

		const code = await main([ 'scan' ]);

		assert.equal(code, 2);
	});

	test('unknown command exits 2', async () => {
		captureOutput();

		const code = await main([ 'bogus' ]);

		assert.equal(code, 2);
	});

	test('malformed --repo exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'no-slash',
		]);

		assert.equal(code, 2);
	});

	test('invalid --severity exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--severity',
			'bogus',
		]);

		assert.equal(code, 2);
	});

	test('unknown --format exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--format',
			'csv',
		]);

		assert.equal(code, 2);
	});

	test('unknown option exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--nope',
		]);

		assert.equal(code, 2);
	});

	test('--help inside scan exits 0', async () => {
		const { stdoutChunks } = captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--help',
		]);

		assert.equal(code, 0);
		assert.match(stdoutChunks.join(''), /Usage:/);
	});

	test('error message is written to stderr', async () => {
		const { stderrChunks } = captureOutput();

		await main([ 'scan' ]);

		assert.ok(stderrChunks.length > 0);
		assert.match(stderrChunks.join(''), /--repo/);
	});

	test('help text lists all documented options', async () => {
		const { stdoutChunks } = captureOutput();

		await main([ '--help' ]);
		const help = stdoutChunks.join('');

		assert.match(help, /--repo/);
		assert.match(help, /--org/);
		assert.match(help, /--token/);
		assert.match(help, /--format/);
		assert.match(help, /--severity/);
		assert.match(help, /--verbose/);
		assert.match(help, /--fail-on-skip/);
	});

	test('--repo and --org together exit 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--org',
			'c',
		]);

		assert.equal(code, 2);
	});

	test('--org with a repo-only flag exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--org',
			'a',
			'--include-archived',
		]);

		assert.equal(code, 2);
	});

	test('malformed --org exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--org',
			'owner/name',
		]);

		assert.equal(code, 2);
	});

	test('missing --token value exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
			'a/b',
			'--token',
		]);

		assert.equal(code, 2);
	});

	test('--repo without value exits 2', async () => {
		captureOutput();

		const code = await main([
			'scan',
			'--repo',
		]);

		assert.equal(code, 2);
	});
});
