import type { Config } from 'jest'

const config: Config = {
  clearMocks: true,
  moduleNameMapper: {
    // Mirror the tsconfig path mapping: the wallet-list data ships from the
    // ui package's src/data (populated by scripts/download-wallet-lists.ts).
    '^@tezos-x/octez.connect-ui/data/(.*)$': '<rootDir>/../octez.connect-ui/src/data/$1'
  },
  testEnvironment: 'node',
  testMatch: ['**/?(*.)+(spec|test).[tj]s?(x)'],
  transform: {
    '^.+\\.(js|jsx|ts|tsx)$': 'babel-jest'
  },
  transformIgnorePatterns: ['/node_modules/(?!(@stablelib)/)']
}

export default config
