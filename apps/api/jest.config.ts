import type { Config } from 'jest';

/** Unit tests — pure logic, no external services. Safe to run in CI. */
const config: Config = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  roots: ['<rootDir>/src'],
  testRegex: '\\.spec\\.ts$',
  moduleFileExtensions: ['ts', 'js', 'json'],
  clearMocks: true,
};

export default config;
