module.exports = {
  preset: 'react-native',
  transformIgnorePatterns: [
    'node_modules/(?!(react-native|@react-native|@react-navigation|react-native-gesture-handler|react-native-reanimated|react-native-safe-area-context|react-native-screens|@shopify/react-native-skia|@op-engineering/op-sqlite|react-native-worklets)/)',
  ],
  moduleNameMapper: {
    // Mock static assets
    '\\.svg$': '<rootDir>/__mocks__/svgMock.js',
  },
  globalSetup: '<rootDir>/jest.globalSetup.js',
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
};
