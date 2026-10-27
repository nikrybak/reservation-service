/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/unit'],
  testRegex: '.*\.spec\.ts$',
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  setupFiles: ['<rootDir>/test/support/silence-nest-logger.ts'],
  collectCoverageFrom: ['src/**/*.ts', '!src/main.ts', '!src/**/postgres/**'],
  coverageDirectory: 'coverage',
};
