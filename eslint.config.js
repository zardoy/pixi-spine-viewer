import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  { ignores: ['dist'] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': [
        'warn',
        { allowConstantExport: true },
      ],
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-unused-vars': 'warn',
    },
  },
  {
    /*
     * Vendored packages are copied verbatim between this repo and the Svelte game codebases, so
     * they must resolve against nothing but their own files and shared runtime deps. This rule is
     * the machine-checkable definition of that contract — everything host-specific is supplied
     * through props or `configureSpineSvelte`.
     */
    files: ['src/vendor/**/*.{ts,tsx}'],
    rules: {
      // Style is upstream's call — enforcing ours here would create sync drift for no benefit.
      'prefer-const': 'off',
      'no-empty': 'off',
      '@typescript-eslint/ban-ts-comment': 'off',
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@/*', '$lib/*', '$app/*', 'valtio', 'sonner', 'react', 'react-*', 'gsap'],
              message:
                'Vendored package: no host-project imports. Supply project-specific behaviour via props or configureSpineSvelte().',
            },
          ],
        },
      ],
    },
  },
)
