import {
	test,
	afterEach,
} from 'node:test';
import assert from 'node:assert/strict';
import { createLogger } from '../../../src/engine/logger.ts';

const captured: string[] = [];

const originalWrite = process.stderr.write.bind(process.stderr);

function captureStderr() {
	process.stderr.write = function spy(chunk: string | Uint8Array): boolean {
		captured.push(String(chunk));

		return true;
	};
}

afterEach(restoreStderr);

function restoreStderr() {
	process.stderr.write = originalWrite;
	captured.length = 0;
}

test('emits warn and error at default level (warn)', defaultLevelCase);

function defaultLevelCase() {
	captureStderr();
	const logger = createLogger();

	logger.debug('d');
	logger.info('i');
	logger.warn('w');
	logger.error('e');

	assert.equal(captured.length, 2);
	assert.match(captured[0] ?? '', /\[warn\] w/);
	assert.match(captured[1] ?? '', /\[error\] e/);
}

test('emits nothing at silent level', silentCase);

function silentCase() {
	captureStderr();
	const logger = createLogger('silent');

	logger.debug('d');
	logger.info('i');
	logger.warn('w');
	logger.error('e');

	assert.equal(captured.length, 0);
}

test('emits all levels at debug level', debugCase);

function debugCase() {
	captureStderr();
	const logger = createLogger('debug');

	logger.debug('d');
	logger.info('i');
	logger.warn('w');
	logger.error('e');

	assert.equal(captured.length, 4);
	assert.match(captured[0] ?? '', /\[debug\] d/);
	assert.match(captured[1] ?? '', /\[info\] i/);
	assert.match(captured[2] ?? '', /\[warn\] w/);
	assert.match(captured[3] ?? '', /\[error\] e/);
}

test('appends JSON data when provided', dataCase);

function dataCase() {
	captureStderr();
	const logger = createLogger('info');

	logger.info('msg', { key: 'val' });

	assert.equal(captured.length, 1);
	assert.match(captured[0] ?? '', /\[info\] msg {"key":"val"}/);
}
