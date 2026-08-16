#!/usr/bin/env node

import { main } from '../dist/cli/main.js';

main(process.argv.slice(2)).then(onSuccess, onFailure);

function onSuccess(code) {
	/*
	 * Set the exit code instead of calling process.exit(): exit() kills the
	 * process before stdout drains, truncating large reports (>64KB) piped
	 * to another process or redirected to a file.
	 */
	process.exitCode = code;
}

function onFailure(err) {
	const message = err instanceof Error ?
		err.message :
		err;

	console.error(message);
	process.exitCode = 2;
}
