/** @type {import('jest').Config} */
const config = {
  preset: 'ts-jest/presets/default-esm',
  testEnvironment: 'node',
  extensionsToTreatAsEsm: ['.ts'],
  moduleNameMapper: {
    '^(\\.{1,2}/.*)\\.js$': '$1',
    '^@agent/(.*)$': '<rootDir>/packages/agent-mastra/src/$1',
    '^@persistence/(.*)$': '<rootDir>/packages/persistence-sqlite/src/$1',
    '^@resilience/(.*)$': '<rootDir>/packages/resilience/src/$1',
    '^@middleware/(.*)$': '<rootDir>/packages/middleware/src/$1',
    '^@shared/(.*)$': '<rootDir>/packages/shared/src/$1'
  },
  transform: {
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'esnext',
          target: 'es2020',
          esModuleInterop: true,
          allowSyntheticDefaultImports: true,
          moduleResolution: 'node'
        }
      }
    ]
  },
  transformIgnorePatterns: [
    'node_modules/(?!(p-retry|opossum|pino|@mastra|retry|delay)/)'
  ],
  testMatch: [
    '**/tests/**/*.test.ts',
    '**/tests/**/*.spec.ts'
  ],
  collectCoverageFrom: [
    'packages/*/src/**/*.ts',
    'apps/*/src/**/*.ts',
    '!**/node_modules/**',
    '!**/dist/**',
    '!**/*.d.ts'
  ],
  coverageThreshold: {
    global: {
      branches: 70,
      functions: 70,
      lines: 80,
      statements: 80
    }
  },
  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 10000,
  verbose: true
};

export default config;