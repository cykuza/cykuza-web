import nextVitals from 'eslint-config-next/core-web-vitals';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...nextVitals,
  {
    ignores: ['.next/**', 'out/**', 'build/**', 'node_modules/**'],
  },
  {
    // Next 16 / eslint-plugin-react-hooks Compiler rules flag widespread
    // pre-existing patterns (setState-in-effect, mount flags). Keep core Next
    // rules; adopt Compiler strictness in a dedicated follow-up, not W0.
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/purity': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];

export default eslintConfig;
