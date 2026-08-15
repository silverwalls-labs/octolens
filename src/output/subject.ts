import type { Finding } from '../types/index.ts';

/**
 * Human-readable subject label for a finding: `owner/name` for repo
 * findings, the organisation login for org findings.
 *
 * @param finding - The finding to label.
 */
export function subjectLabel(finding: Finding): string {
	if (finding.repo) {
		return `${finding.repo.owner}/${finding.repo.name}`;
	}

	return finding.org ?? '';
}
