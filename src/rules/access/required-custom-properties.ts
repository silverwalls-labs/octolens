import {
	getOrgCustomPropertySchema,
	getRepoCustomPropertyValues,
} from '../../github/queries.ts';
import type { Finding, Rule } from '../../types/index.ts';

const RULE_ID = 'access/required-custom-properties';

const REMEDIATION = 'Set the property under Settings -> Custom properties, or have ' +
	'your org admin update the value through the org-level custom properties UI.';

/**
 * Flags repositories missing a value for any custom property the
 * organisation marks as required.
 */
export const rule: Rule = {
	id: RULE_ID,
	category: 'access',
	defaultSeverity: 'medium',
	summary: 'All required organization custom properties must be set',
	docs: RULE_ID,

	async check(ctx) {
		const schema = await getOrgCustomPropertySchema(
			ctx.octokit,
			ctx.cache,
			ctx.repo.owner,
		);

		if (!schema) {
			return [];
		}

		const required = schema.filter(isRequired);

		if (required.length === 0) {
			return [];
		}

		const values = await getRepoCustomPropertyValues(ctx.octokit, ctx.cache, ctx.repo);

		if (values === null) {
			return [];
		}

		const present = new Set<string>();

		for (const v of values) {
			if (isPropertyValuePresent(v.value)) {
				present.add(v.propertyName);
			}
		}

		const findings: Finding[] = [];

		for (const def of required) {
			if (present.has(def.propertyName)) {
				continue;
			}
			findings.push({
				ruleId: RULE_ID,
				severity: 'medium',
				repo: ctx.repo,
				title: `Required custom property '${def.propertyName}' is unset`,
				detail: `The organization marks '${def.propertyName}' as required, ` +
					'but this repository does not have a value for it.',
				remediation: REMEDIATION,
			});
		}

		return findings;
	},
};

/**
 * Subset of a property definition carrying the required flag.
 */
type RequiredOnly = {
	required: boolean;
};

/**
 * Check whether a property definition is marked required.
 *
 * @param def - Property definition to inspect.
 * @returns   True when the definition demands a value.
 */
function isRequired(def: RequiredOnly): boolean {
	return def.required === true;
}

/**
 * Check whether an assigned value is non-empty.
 *
 * @param value - Assigned property value.
 * @returns     True for a non-empty value.
 */
function isPropertyValuePresent(value: string | string[] | null): boolean {
	if (value === null) {
		return false;
	}
	if (Array.isArray(value)) {
		return value.length > 0;
	}

	return value.length > 0;
}
