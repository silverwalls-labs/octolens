import type { OrgScanReport, ScanResult } from '../types/index.ts';

/**
 * Serialize a scan result or fleet report to a pretty-printed JSON string.
 *
 * @param result - The scan result or org fleet report to format.
 * @returns      JSON with 2-space indentation and a trailing newline.
 */
export function formatJson(result: ScanResult | OrgScanReport): string {
	return `${JSON.stringify(result, null, 2)}\n`;
}
