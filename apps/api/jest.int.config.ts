import type { Config } from 'jest';

/**
 * Integration tests — boot the Nest app against the dev backing services
 * (Mongo replica set, Redis, MinIO). Requires the dev stack to be up.
 */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/test'],
  testRegex: '\\.spec\\.ts$',
  setupFiles: ['<rootDir>/test/setup-env.ts'],
  moduleFileExtensions: ['ts', 'js', 'json'],
  testTimeout: 60000,
};

export default config;
