#!/usr/bin/env node

import { main } from '../dist/cli/main.js';

main(process.argv.slice(2)).then(onSuccess, onFailure);

function onSuccess(code) {
	process.exit(code);
}

function onFailure(err) {
	const message = err instanceof Error ?
		err.message :
		err;

	console.error(message);
	process.exit(2);
}
