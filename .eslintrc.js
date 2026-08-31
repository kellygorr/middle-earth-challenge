module.exports = {
  root: true,
  extends: '@react-native',
  ignorePatterns: ['android/**/build/**', 'coverage/**'],
  overrides: [
    {
      // Disallow hardcoded `fontSize:` numeric literals in component / screen
      // code. Use a `typography` token (preferably `typographyThemed(theme)`
      // so it scales with the Text size setting) instead.
      files: ['src/**/*.{ts,tsx}'],
      excludedFiles: ['src/styles/typography.ts'],
      rules: {
        'no-restricted-syntax': [
          'warn',
          {
            selector:
              "Property[key.name='fontSize'][value.type='Literal'][value.value=/^[0-9]+$/]",
            message:
              'Avoid hardcoded fontSize. Use a typography token via typographyThemed(theme) so it scales with the user Text size setting.',
          },
          {
            selector:
              "Property[key.name='fontSize'][value.type='UnaryExpression']",
            message:
              'Avoid hardcoded fontSize. Use a typography token via typographyThemed(theme) so it scales with the user Text size setting.',
          },
        ],
      },
    },
    {
      // Jest globals for test files and the shared jest setup script.
      // Without this override every `jest.mock(...)` / `jest.fn()` call
      // triggers a `no-undef` error under the default `@react-native`
      // config, since jest isn't part of the base globals set.
      files: [
        'jest.setup.js',
        '**/__tests__/**/*.{ts,tsx,js}',
        '**/*.test.{ts,tsx,js}',
      ],
      env: {
        jest: true,
      },
    },
  ],
};
