import {
	getActionsSecrets,
	getCodespacesSecrets,
	getDependabotSecrets,
} from '../../github/queries.ts';
import type {
	SecretInventory,
	SecretMetadata,
} from '../../github/queries.ts';
import { skip } from '../../types/index.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'security/secrets-rotation';
const ROTATION_THRESHOLD_DAYS = 90;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

const DETAIL_PREFIX = 'GitHub does not rotate Actions, Dependabot, or Codespaces ' +
	'secrets automatically. Long-lived credentials accumulate exposure as more ' +
	'workflow runs and people interact with them.';

const REMEDIATION = 'Rotate the secret at its source (cloud provider, npm, etc.), ' +
	'then update its value in Settings -> Secrets and variables. Prefer short-lived ' +
	'OIDC federation where possible (e.g. AWS, GCP, Vault) to remove long-lived ' +
	'credentials entirely.';

type StaleSecret = {
	store: SecretInventory['store'];
	name: string;
	ageDays: number;
};

export const rule: Rule = {
	id: RULE_ID,
	category: 'security',
	defaultSeverity: 'low',
	summary: 'Long-lived secrets should be rotated at least every 90 days',
	docs: RULE_ID,

	async check(ctx) {
		const inventories = await Promise.all([
			getActionsSecrets(ctx.octokit, ctx.cache, ctx.repo),
			getDependabotSecrets(ctx.octokit, ctx.cache, ctx.repo),
			getCodespacesSecrets(ctx.octokit, ctx.cache, ctx.repo),
		]);

		if (inventories.every((inv) => !inv.checked)) {
			return skip('could not list any secret store (no permission)');
		}

		const now = Date.now();
		const stale = inventories.flatMap((inv) => collectStale(inv, now));

		if (stale.length === 0) {
			return [];
		}

		const description = stale.map(formatStale).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'low',
			repo: ctx.repo,
			title: `${stale.length} secret(s) have not been rotated in over ` +
				`${ROTATION_THRESHOLD_DAYS} days`,
			detail: `${DETAIL_PREFIX} Stale secrets: ${description}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

function collectStale(inventory: SecretInventory, now: number): StaleSecret[] {
	if (!inventory.checked) {
		return [];
	}

	return inventory.secrets
		.map((s) => toStale(inventory.store, s, now))
		.filter(isStale);
}

function toStale(
	store: SecretInventory['store'],
	secret: SecretMetadata,
	now: number,
): StaleSecret {
	const updated = Date.parse(secret.updatedAt);
	const ageDays = Number.isNaN(updated) ?
		0 :
		Math.floor((now - updated) / MS_PER_DAY);

	return {
		store,
		name: secret.name,
		ageDays,
	};
}

function isStale(secret: StaleSecret): boolean {
	return secret.ageDays > ROTATION_THRESHOLD_DAYS;
}

function formatStale(secret: StaleSecret): string {
	return `${secret.store}/${secret.name} (${secret.ageDays}d)`;
}
