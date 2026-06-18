import nextConfig from "eslint-config-next/core-web-vitals"

// Flat config for ESLint 10 + Next.js 16.
// `next lint` was removed in Next 16; linting now runs via the ESLint CLI
// (`npm run lint` -> `eslint .`). See docs/backlog migration of PR #80.
const eslintConfig = [
  ...nextConfig,
  {
    ignores: [".next/**", "node_modules/**", "next-env.d.ts"],
  },
]

export default eslintConfig
