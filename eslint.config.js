import js from '@eslint/js';
import globals from 'globals';
import markdown from '@eslint/markdown';
import { defineConfig } from 'eslint/config';
import stylistic from '@stylistic/eslint-plugin';
import tseslint from 'typescript-eslint';
import myConfig from '@sheplu/eslint-config/src/stylistic.js';

export default defineConfig([
	{
		ignores: [ 'dist/**', 'node_modules/**' ],
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
		'files': [ '**/*.md' ],
		'plugins': { markdown },
		'language': 'markdown/gfm',
		'extends': [ 'markdown/recommended' ],
	},
]);
