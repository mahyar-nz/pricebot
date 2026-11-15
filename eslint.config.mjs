import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['**/dist/**', '**/.next/**', '**/.local/**', '**/generated/**', '**/node_modules/**', '**/.turbo/**'] },
  {
    files: ['**/*.ts', '**/*.tsx'],
    languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
    plugins: { '@typescript-eslint': tseslint.plugin },
    rules: {
      'no-debugger': 'error',
      'no-constant-condition': 'error',
      'no-unreachable': 'error',
      'no-duplicate-case': 'error',
      '@typescript-eslint/no-floating-promises': 'off'
    }
  }
);
