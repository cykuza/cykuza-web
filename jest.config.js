const nextJest = require('next/jest')

const createJestConfig = nextJest({
  dir: './',
})

/** @type {import('jest').Config} */
const customJestConfig = {
  setupFilesAfterEnv: ['<rootDir>/jest.setup.js'],
  // Wallet crypto tests run in Node; jsdom resolves uint8array-tools to ESM browser build.
  testEnvironment: 'node',
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/$1',
    '^uint8array-tools$':
      '<rootDir>/node_modules/uint8array-tools/src/cjs/index.cjs',
  },
  modulePathIgnorePatterns: ['<rootDir>/.next/'],
}

module.exports = async () => {
  const config = await createJestConfig(customJestConfig)()
  // next/jest prepends its own ignore list; force-transform ESM crypto helpers.
  config.transformIgnorePatterns = [
    '/node_modules/(?!(uint8array-tools|@noble|@scure|@bitcoinerlab|bip32|ecpair|bitcoinjs-lib)/)',
  ]
  return config
}
