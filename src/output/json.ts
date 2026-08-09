import type { ScanResult } from '../types/index.ts';

/**
 * Serialize a scan result to a pretty-printed JSON string.
 *
 * @param result - The scan result to format.
 * @returns JSON with 2-space indentation and a trailing newline.
 */
export function formatJson(result: ScanResult): string {
	return `${JSON.stringify(result, null, 2)}\n`;
}
