import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import prettier from 'eslint-config-prettier';
import globals from 'globals';

export default tseslint.config(
  {
    ignores: [
      'dist',
      'ios',
      'android',
      'node_modules',
      'playwright-report',
      'test-results',
      'coverage',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
    },
  },
  {
    // End-to-end tests reach into the page's untyped debug hooks.
    files: ['e2e/**/*.ts'],
    rules: { '@typescript-eslint/no-explicit-any': 'off' },
  },
  {
    // The core must stay pure: no rendering, no DOM.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: { ...globals.es2021 } },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['pixi.js', 'pixi.js/*'], message: 'src/core must not import PixiJS.' },
            {
              group: ['**/view/**', '**/input/**', '**/platform/**', '**/audio/**'],
              message: 'src/core must stay pure.',
            },
            { group: ['@capacitor/*'], message: 'src/core must not import Capacitor.' },
          ],
        },
      ],
      'no-restricted-globals': ['error', 'window', 'document', 'navigator', 'localStorage'],
    },
  },
);
