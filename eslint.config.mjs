import eslint from '@eslint/js'
import tseslint from 'typescript-eslint'

export default tseslint.config(
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          // `const { pii: _pii, ...rest } = row` — strip-field destructures.
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^_',
        },
      ],
      // eslint 10 promoted this rule; allowed previously. Most of our
      // hits are "let x = …; x = …" patterns the new rule flags.
      'no-useless-assignment': 'off',
      'no-console': 'off',
    },
  },
  {
    ignores: ['**/dist/', '**/node_modules/', '**/coverage/'],
  },
)
