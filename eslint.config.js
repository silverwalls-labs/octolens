import js from '@eslint/js';
import globals from 'globals';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import jsdoc from 'eslint-plugin-jsdoc';
import myConfig from '@sheplu/eslint-config/src/stylistic.js';
import jsdocConfig from '@sheplu/eslint-config/src/jsdoc.js';

/*
 * The shared jsdoc config ships two keys ESLint cannot resolve:
 * 'jsdonc/check-syntax' (typo'd plugin namespace) and 'jsdoc/required-tags'
 * (the real rule name is 'require-tags'). Strip them here - an 'off'
 * override is not enough for an unknown plugin namespace.
 */
const sharedJsdocRules = { ...jsdocConfig[0].rules };

delete sharedJsdocRules['jsdonc/check-syntax'];
delete sharedJsdocRules['jsdoc/required-tags'];

export default defineConfig([
	{
		ignores: [
			'dist/**',
			'node_modules/**',
			'docs/**',
			'coverage/**',
			'.claude/**',
		],
	},
	{
		'files': [ '**/*.{js,mjs,cjs}' ],
		'plugins': { js, '@stylistic': stylistic },
		'extends': [ 'js/recommended', myConfig ],
		'languageOptions': {
			globals: globals.node,
		},
	},
	{
		'files': [ '**/*.ts' ],
		'plugins': { '@stylistic': stylistic },
		'extends': [ tseslint.configs.recommended, myConfig ],
		'languageOptions': {
			parser: tseslint.parser,
			globals: globals.node,
		},
	},
	{
		files: [ 'src/**/*.ts' ],
		plugins: { jsdoc },
		rules: {
			...sharedJsdocRules,

			// What the two stripped keys intended.
			'jsdoc/check-syntax': 'error',
			'jsdoc/require-tags': 'off',

			// Deprecated; does not run on ESLint >= 8.
			'jsdoc/check-examples': 'off',

			// Self-contradictory as shipped: flags every JSDoc block / every file.
			'jsdoc/no-restricted-syntax': 'off',
			'jsdoc/no-missing-syntax': 'off',

			// Shipped with both escape options false, which the rule rejects.
			'jsdoc/text-escaping': 'off',

			/*
			 * TypeScript already validates type references; with TS sources this
			 * rule misreports exported types as unused typedefs.
			 */
			'jsdoc/no-undefined-types': 'off',

			// House style: hyphen before @param descriptions only, not @returns.
			'jsdoc/require-hyphen-before-param-description': [ 'error', 'always' ],

			/*
			 * Require @returns only when a value is actually returned: the shipped
			 * forceRequireReturn demands @returns on void functions, which
			 * require-returns-check then rejects. Its fixer also corrupts
			 * single-line blocks, so keep it disabled.
			 */
			'jsdoc/require-returns': [
				'error',
				{
					checkConstructors: false,
					checkGetters: true,
					contexts: [ 'any' ],
					enableFixer: false,
					exemptedBy: [ 'inheritdoc' ],
					forceRequireReturn: false,
					forceReturnsWithAsync: false,
					publicOnly: false,
				},
			],

			/*
			 * House style: adjacent tags, one blank line after the description.
			 * The shared "always" value fights sort-tags' intra-group spacing check.
			 */
			'jsdoc/tag-lines': [
				'error',
				'never',
				{
					startLines: 1,
				},
			],

			// Do not treat common abbreviations as sentence ends.
			'jsdoc/require-description-complete-sentence': [
				'error',
				{
					abbreviations: [
						'e.g.',
						'i.e.',
						'etc.',
						'vs.',
					],
				},
			],

			/*
			 * TS is the source of truth for types; keep jsdoc/no-types instead.
			 * (type-formatting also ships options invalid for the installed plugin.)
			 */
			'jsdoc/type-formatting': 'off',
			'jsdoc/require-param-type': 'off',
			'jsdoc/require-property-type': 'off',
			'jsdoc/require-returns-type': 'off',
			'jsdoc/require-throws-type': 'off',
			'jsdoc/require-yields-type': 'off',
			'jsdoc/require-next-type': 'off',

			// Conflicts with no-multiple-empty-lines(max:1) / padded-blocks(never).
			'jsdoc/lines-before-block': 'off',

			/*
			 * Project policy: no @example / @file requirements, keep plain comments,
			 * and no non-standard @rejects tags on async functions.
			 */
			'jsdoc/require-example': 'off',
			'jsdoc/require-file-overview': 'off',
			'jsdoc/convert-to-jsdoc-comments': 'off',
			'jsdoc/require-rejects': 'off',

			/*
			 * Scope to the exported API without the contexts:['any'] blast radius.
			 * The fixer only inserts empty stubs, so keep it disabled.
			 */
			'jsdoc/require-jsdoc': [
				'error',
				{
					enableFixer: false,
					publicOnly: {
						ancestorsOnly: false,
						esm: true,
						cjs: true,
						window: true,
					},
					require: {
						ArrowFunctionExpression: true,
						ClassDeclaration: true,
						ClassExpression: true,
						FunctionDeclaration: true,
						FunctionExpression: true,
						MethodDefinition: true,
					},
					contexts: [
						'TSTypeAliasDeclaration',
						'TSInterfaceDeclaration',
						'TSEnumDeclaration',
						'ExportNamedDeclaration > VariableDeclaration',
					],
				},
			],
		},
		settings: {
			jsdoc: { mode: 'typescript' },
		},
	},
	{
		'files': [ '**/*.md' ],
		'plugins': { markdown },
		'language': 'markdown/gfm',
		'extends': [ 'markdown/recommended' ],
	},
]);
