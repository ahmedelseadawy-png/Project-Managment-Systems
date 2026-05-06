import nextVitals from 'eslint-config-next/core-web-vitals'

const ignored = [
  '.next/**',
  'node_modules/**',
  'out/**',
  'dist/**',
  'coverage/**',
  'supabase/**',
  'database/**',
  'next-env.d.ts',
]

const config = [
  { ignores: ignored },
  ...nextVitals,
  {
    rules: {
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/refs': 'off',
      'react/jsx-key': 'off',
      'react/no-unescaped-entities': 'off',
    },
  },
]

export default config
