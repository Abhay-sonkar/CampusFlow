/** Jest settings: run TypeScript tests from the tests/ folder */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  // Runs before every test file: safe settings, so tests can never touch your real database or Redis
  setupFiles: ['<rootDir>/tests/setup-env.ts'],
  transform: {
    // Transpile only (no type-checking): fast, and type errors are caught by `npm run build` instead
    '^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.test.json', diagnostics: false }],
  },
  testTimeout: 60000,
  clearMocks: true,
  collectCoverageFrom: ['src/**/*.ts', '!src/server.ts', '!src/worker.ts', '!src/scripts/**'],
};
