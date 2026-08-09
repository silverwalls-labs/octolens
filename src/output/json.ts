import type { ScanResult } from '../types/index.ts';

export function formatJson(result: ScanResult): string {
	return `${JSON.stringify(result, null, 2)}\n`;
}
