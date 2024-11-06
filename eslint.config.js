import js from '@eslint/js';
import vitest from '@vitest/eslint-plugin';
import eslintConfigPrettier from 'eslint-config-prettier';
// @ts-expect-error no types available
import eslintPluginImport from 'eslint-plugin-import';
// @ts-expect-error no types available
import eslintPluginPromise from 'eslint-plugin-promise';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default [
  {
    ignores: [
      'dist/',
      'tmp/',
      'bin/',
      'coverage/',
      'html/',
      '**/node_modules/',
      '.pnpm-store',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  ...tseslint.configs.stylisticTypeChecked,
  eslintPluginImport.flatConfigs.errors,
  eslintPluginImport.flatConfigs.warnings,
  eslintPluginImport.flatConfigs.recommended,
  eslintPluginImport.flatConfigs.typescript,
  vitest.configs.recommended,
  eslintPluginPromise.configs['flat/recommended'],
  {
    plugins: {
      '@vitest': vitest,
    },

    linterOptions: {
      reportUnusedDisableDirectives: true,
    },

    languageOptions: {
      globals: {
        ...globals.node,
      },

      ecmaVersion: 'latest',

      sourceType: 'module',

      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },

    settings: {
      'import/resolver': {
        typescript: {
          alwaysTryTypes: true,
          project: './tsconfig.lint.json',
        },
      },
    },
  },
  eslintConfigPrettier,
  {
    files: ['**/*.{ts,js,cjs,mjs}'],
    rules: {
      'import/default': 2,
      'import/named': 2,
      'import/namespace': 2,
      'import/no-named-as-default-member': 0,

      'import/no-extraneous-dependencies': [
        'error',
        {
          devDependencies: [
            'eslint.config.js',
            'test/**',
            'tools/**',
            'vite.config.ts',
            '__mocks__/**',
            '**/*.spec.ts',
          ],
        },
      ],

      'import/prefer-default-export': 0,
      'import/no-cycle': 2,
      'consistent-return': 0,
      eqeqeq: 'error',
      'no-console': 'error',
      'no-negated-condition': 'error',
      'no-param-reassign': 'error',
      'no-template-curly-in-string': 'error',

      'sort-imports': [
        'error',
        {
          ignoreCase: false,
          ignoreDeclarationSort: true,
          ignoreMemberSort: false,
          memberSyntaxSortOrder: ['none', 'all', 'multiple', 'single'],
        },
      ],

      'import/no-unresolved': [
        'error',
        {
          ignore: ['^mdast$'],
        },
      ],

      'import/order': [
        'error',
        {
          alphabetize: {
            order: 'asc',
          },
        },
      ],

      'no-restricted-imports': [
        2,
        {
          paths: [
            'nock',
            'node:test',
            'parse-link-header',
            'path',
            'semver',
            {
              name: 'vitest',
              importNames: ['it'],
              message: 'Please use `vitest.test` instead.',
            },
          ],
        },
      ],

      '@typescript-eslint/consistent-type-assertions': [
        'error',
        {
          assertionStyle: 'as',
          objectLiteralTypeAssertions: 'allow',
        },
      ],

      '@typescript-eslint/explicit-function-return-type': [
        'error',
        {
          allowExpressions: true,
          allowTypedFunctionExpressions: true,
        },
      ],

      '@typescript-eslint/no-explicit-any': 0,
      '@typescript-eslint/no-non-null-assertion': 0,

      '@typescript-eslint/no-unused-vars': [
        2,
        {
          vars: 'all',
          args: 'none',
          ignoreRestSiblings: true,
        },
      ],

      '@typescript-eslint/prefer-optional-chain': 2,
      '@typescript-eslint/prefer-nullish-coalescing': 2,
      curly: [2, 'all'],
      'require-await': 2,
      '@typescript-eslint/no-unsafe-assignment': 0,
      '@typescript-eslint/no-unsafe-member-access': 0,
      '@typescript-eslint/no-unsafe-return': 0,
      '@typescript-eslint/no-unsafe-call': 0,
      '@typescript-eslint/no-unsafe-argument': 0,

      '@typescript-eslint/restrict-template-expressions': [
        2,
        {
          allowNumber: true,
          allowBoolean: true,
        },
      ],

      '@typescript-eslint/restrict-plus-operands': 2,

      '@typescript-eslint/naming-convention': [
        2,
        {
          selector: 'enumMember',
          format: ['PascalCase'],
        },
      ],

      '@typescript-eslint/unbound-method': [
        2,
        {
          ignoreStatic: true,
        },
      ],

      '@typescript-eslint/no-empty-object-type': 2,

      'object-shorthand': [
        'error',
        'always',
        {
          avoidQuotes: true,
        },
      ],
    },
  },
  {
    files: ['**/*.spec.ts', 'test/**'],
    languageOptions: {
      globals: {
        ...globals.jest,
      },
    },
    rules: {
      'no-template-curly-in-string': 0,
      'prefer-destructuring': 0,
      'prefer-promise-reject-errors': 0,
      'import/no-dynamic-require': 0,
      'global-require': 0,
      '@typescript-eslint/no-var-requires': 0,
      '@typescript-eslint/no-object-literal-type-assertion': 0,
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/unbound-method': 0,
      'max-classes-per-file': 0,
      'class-methods-use-this': 0,
      'no-console': 0,
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 0,
      '@typescript-eslint/explicit-module-boundary-types': 0,
      '@typescript-eslint/restrict-template-expressions': 0,
    },
  },
  {
    files: ['tools/**/*.{ts,js,mjs,cjs}', '__mocks__/*.ts'],
    languageOptions: {
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off',
    },
  },
  {
    files: ['tools/**/*.{js,cjs}', 'bin/*.{js,cjs}'],
    rules: {
      '@typescript-eslint/no-var-requires': 'off',
    },
  },
  {
    files: ['**/*.mjs', '**/*.js'],
    rules: {
      'import/extensions': 0,
    },
  },
];
