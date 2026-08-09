import { getRepoWebhooks } from '../../github/queries.ts';
import type { WebhookSummary } from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/webhooks-use-https';

const DETAIL = 'One or more webhooks deliver to insecure endpoints (plain HTTP) ' +
	'or have SSL verification disabled. Webhook payloads can carry tokens, code, ' +
	'and full event data and must travel over a verified TLS channel.';

const REMEDIATION = 'Settings -> Webhooks -> edit each affected hook: switch to ' +
	'an https:// URL and uncheck "Disable SSL verification".';

export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'Webhooks must use HTTPS with SSL verification',
	docs: RULE_ID,

	async check(ctx) {
		const webhooks = await getRepoWebhooks(ctx.octokit, ctx.cache, ctx.repo);
		const insecure = webhooks.filter(isInsecure);

		if (insecure.length === 0) {
			return [];
		}

		const summary = insecure.map(describe).join(', ');
		const finding: Finding = {
			ruleId: RULE_ID,
			severity: 'medium',
			repo: ctx.repo,
			title: `${insecure.length} webhook(s) use insecure delivery`,
			detail: `${DETAIL} Insecure webhooks: ${summary}.`,
			remediation: REMEDIATION,
		};

		return [ finding ];
	},
};

function isInsecure(hook: WebhookSummary): boolean {
	return hook.url.startsWith('http://') || hook.insecureSsl;
}

function describe(hook: WebhookSummary): string {
	const reason = hook.insecureSsl ?
		'ssl verification disabled' :
		'plain http';

	return `#${hook.id} (${reason})`;
}
