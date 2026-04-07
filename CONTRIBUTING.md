# Contributing to NestFleet

Thank you for your interest in contributing.

## Development setup

### Prerequisites

- Node.js 22+
- Docker + Docker Compose (for integration tests and local PostgreSQL)
- Colima or Docker Desktop (macOS)

### Install

```bash
git clone https://github.com/nestfleet/nestfleet.git
cd nestfleet
npm install
cd console && npm install && cd ..
```

### Configure

```bash
cp .env.example .env
# Fill in JWT_SECRET, ENCRYPTION_KEY (see README for generation commands)
# LLM_API_KEY is optional for most tests
```

### Run locally

```bash
# Start PostgreSQL
docker compose up -d postgres

# API (auto-reload)
npm run dev

# Console (separate terminal)
cd console && npm run dev
```

## Testing

```bash
# Unit tests (fast, no Docker needed)
npm test

# Integration tests (requires running Docker daemon)
npm run test:integration

# TypeScript typecheck
npm run lint

# E2E tests (requires both API and console running)
cd console && npx playwright test
```

### Test infrastructure

- **Unit**: Vitest, mocked dependencies, no DB
- **Integration**: Vitest + Testcontainers (spins up a real PostgreSQL container per suite)
- **E2E**: Playwright against a running dev stack

All new features must include unit tests. Backend API changes must include integration tests. See `tests/` for patterns.

## Code conventions

- TypeScript strict mode (`tsconfig.json`)
- ESM throughout (`"type": "module"`)
- No `liteLLM` — use provider SDKs directly (`@ai-sdk/anthropic`, `@ai-sdk/openai`, etc.)
- Thin controllers → service layer → repository pattern for DB access
- Every route must go through `requireAuth` + `requireRole` middleware
- Structured logging via `logger` (pino) — always include `requestId` and `productId` in context

## Pull requests

1. Branch from `main`: `git checkout -b feat/your-feature`
2. Write tests first (TDD preferred)
3. Keep PRs focused — one feature or fix per PR
4. Update `docs/` if adding a new concept, route, or configuration option
5. The PR description should explain *why*, not just *what*

## Commit messages

Follow conventional commits style:
```
feat(billing): add Stripe checkout endpoint
fix(triage): handle null severity in case routing
docs: update README quick-start section
```

## License

By contributing, you agree that your contributions will be licensed under the [AGPL-3.0](LICENSE).
