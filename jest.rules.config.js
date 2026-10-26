// Separate Jest project for Firestore security rules tests. These run
// against the Firestore emulator over real network calls, so they must not
// use the React Native preset's jsdom-flavored test environment or its
// setupFilesAfterEnv mocks (gesture-handler, reanimated, etc.) — a plain
// Node environment is what @firebase/rules-unit-testing expects.
module.exports = {
  preset: 'react-native',
  testEnvironment: 'node',
  setupFilesAfterEnv: [],
  testMatch: ['<rootDir>/firestore-tests/**/*.test.ts'],
};
