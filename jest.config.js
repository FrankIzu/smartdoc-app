/** @type {import('jest').Config} */
module.exports = {
  // Pure node env — no React Native renderer needed for geometry tests
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/utils/fillable/__tests__/**/*.test.ts',
    '<rootDir>/utils/__tests__/**/*.test.ts',
  ],
  // Exclude Python venv from module scanning (fixes jupyterlab-plotly haste collision)
  modulePathIgnorePatterns: ['<rootDir>/manager-francis/'],
  watchPathIgnorePatterns: ['<rootDir>/manager-francis/'],
  // Transform TS using plain babel — explicitly disable project babel.config.js
  // to avoid babel-preset-expo pulling in expo/virtual/env.js (ESM)
  transform: {
    '^.+\\.tsx?$': [
      'babel-jest',
      {
        configFile: false,
        presets: [
          ['@babel/preset-env', { targets: { node: 'current' } }],
          '@babel/preset-typescript',
        ],
      },
    ],
  },
  // __DEV__ is a React Native global; define it for the pure-node test environment
  globals: {
    __DEV__: true,
  },
  // Don't transform node_modules
  transformIgnorePatterns: ['node_modules/'],
};
