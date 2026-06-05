module.exports = {
  root: true,
  extends: '@react-native',
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
  ],
};
