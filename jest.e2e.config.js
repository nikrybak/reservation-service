/** @type {import('jest').Config} */
module.exports = {
  rootDir: '.',
  testEnvironment: 'node',
  roots: ['<rootDir>/test/e2e'],
  testRegex: '.*\.e2e-spec\.ts$',
  transform: {
    '^.+\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
  },
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 30000,
};
