import type { Logger } from '../types/index.ts';

/**
 * Log verbosity level.
 *
 * From most to least verbose: `debug`, `info`, `warn`, `error`, `silent`.
 */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error' | 'silent';

const LEVEL_RANK: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
	silent: 4,
};

/**
 * Create a {@link Logger} that writes to stderr.
 *
 * Messages below the given level are suppressed. The `'silent'` level
 * suppresses all output.
 *
 * @param level - Minimum level to emit. Defaults to `'warn'`.
 */
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
