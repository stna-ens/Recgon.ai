import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'

const eslintConfig = [
  {
    ignores: [
      'node_modules/',
      '.next/',
      'out/',
      'mcp-server/dist/',
      'scripts/',
      'supabase/',
    ],
  },
  ...nextCoreWebVitals,
  {
    rules: {
      // Advisory pattern rule from react-hooks v6 — the codebase predates it.
      // Kept visible as a warning; new code should not add instances.
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
]

export default eslintConfig
