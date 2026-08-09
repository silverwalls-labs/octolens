import type { Logger } from '../types/index.ts';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	silent: 4,
};

export function createLogger(level: LogLevel = 'warn'): Logger {
	const threshold = LEVEL_RANK[level];

	function emit(stream: 'stdout' | 'stderr', tag: string, message: string, data?: unknown): void {
		const line = data === undefined ?
			`[${tag}] ${message}` :
			`[${tag}] ${message} ${JSON.stringify(data)}`;

		if (stream === 'stdout') {
			process.stdout.write(`${line}\n`);
		} else {
			process.stderr.write(`${line}\n`);
		}
	}

	return {
		debug(message, data) {
			if (threshold <= LEVEL_RANK.debug) emit('stderr', 'debug', message, data);
		},
		info(message, data) {
			if (threshold <= LEVEL_RANK.info) emit('stderr', 'info', message, data);
		},
		warn(message, data) {
			if (threshold <= LEVEL_RANK.warn) emit('stderr', 'warn', message, data);
		},
		error(message, data) {
			if (threshold <= LEVEL_RANK.error) emit('stderr', 'error', message, data);
		},
	};
}
