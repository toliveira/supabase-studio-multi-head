# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What This Is

A **multi-head fork** of Supabase Studio that manages multiple isolated Supabase projects from a single self-hosted dashboard. Built on top of the upstream `apps/studio` from the Supabase monorepo. pnpm 10 + Turborepo. Requires Node >= 22.

Key fork additions live in `multihead/` (Docker orchestration, CLI at `multihead/cli/smh.mjs`) and scattered `self-hosted` paths throughout the API layer (`lib/api/self-hosted/`, `pages/api/`).

## Commands

```bash
pnpm install                          # install dependencies
pnpm dev                              # run Studio dev server (port 8082)
pnpm test                             # unit tests (vitest, --run --coverage)
pnpm test:watch                       # vitest in watch mode
npx vitest run path/to/file.test.ts   # run a single test file
npx vitest run -t "test name"         # run a single test by name
pnpm lint                             # eslint
pnpm typecheck                        # tsc --noEmit
pnpm build                            # next build

# Multi-head Docker stack
cd multihead && bash start.sh         # new install (generates .env, spins up stack)
cd multihead && bash integrate.sh     # overlay onto existing Supabase deployment
```

## Architecture

### Routing — Pages Router (not App Router)

Next.js Pages Router. Routes are under `pages/`. The `app/` directory only contains API routes.

- **Project pages**: `pages/project/[ref]/` — each section (database, auth, storage, etc.) is a subdirectory
- **Org pages**: `pages/org/` — organization-level settings, billing
- **API routes**: `pages/api/platform/` (forwarded to Supabase platform APIs) and `pages/api/v1/` (self-hosted implementations)

### Platform vs Self-Hosted Branching

The `IS_PLATFORM` constant (`lib/constants/index.ts`) controls whether the app talks to Supabase Cloud APIs or self-hosted API implementations. API routes in `pages/api/platform/` check this flag and either proxy to the platform or delegate to `lib/api/self-hosted/`. The multi-head fork adds its own project registry at `lib/api/self-hosted/project-registry`.

### Data Fetching — React Query + openapi-fetch

All server data flows through `@tanstack/react-query`. The pattern is:

1. **Keys**: `data/{domain}/keys.ts` — query key factories
2. **Queries**: `data/{domain}/*-query.ts` — export a standalone `async` fetch function + a `use*Query` hook
3. **Mutations**: `data/{domain}/*-mutation.ts` — `useMutation` hooks with invalidation

The typed HTTP client is in `data/fetchers.ts` — an `openapi-fetch` client generated from OpenAPI types (`data/api.d.ts`). Use `get()`, `post()`, `put()`, `del()` from there. API routes use `lib/api/apiWrapper.ts` for error handling and optional auth.

### State Management

- **Server state**: React Query (primary)
- **Client state**: Valtio proxies in `state/` — e.g., `app-state.ts`, `sql-editor-v2.ts`, `table-editor.tsx`
- **URL state**: `nuqs` for query param state

### Component Organization

- `components/interfaces/` — feature-level components (Auth, Database, Billing, etc.)
- `components/layouts/` — page layout wrappers, each feature section has its own layout (e.g., `DatabaseLayout`, `AuthLayout`)
- `components/ui/` — low-level UI primitives (prefer importing from the `ui` package instead)
- `hooks/` — custom React hooks, organized by domain (`analytics/`, `misc/`, `ui/`)

### Workspace Packages

| Package | Import as | Purpose |
|---|---|---|
| `packages/ui` | `'ui'` | Shared UI components (shadcn/ui based) |
| `packages/ui-patterns` | `'ui-patterns'` | Higher-level reusable patterns |
| `packages/common` | `'common'` | Shared utilities, telemetry constants, auth helpers |
| `packages/pg-meta` | `'@supabase/pg-meta'` | Postgres metadata introspection |
| `packages/api-types` | `'api-types'` | Generated API type definitions |

## Conventions

**Imports** — use `@/` path alias (maps to project root). Import UI from `'ui'`, use `_Shadcn_` suffixed variants for form primitives. Check `packages/ui/index.tsx` before creating new primitives.

**Styling** — Tailwind only, semantic tokens (`bg-muted`, `text-foreground-light`), no hardcoded colors.

**Files** — co-locate sub-components with parent. Avoid barrel re-export files (`barrel-files/avoid-re-export-all` is an eslint error).

**API routes** — wrap handlers in `apiWrapper()` from `lib/api/apiWrapper.ts`. Check `IS_PLATFORM` when the behavior differs between cloud and self-hosted.

**Testing** — vitest + jsdom + `@testing-library/react`. MSW for API mocking (setup in `tests/lib/msw`). Router is mocked via `next-router-mock`. Test files go in `tests/` mirroring source structure, or co-located as `*.test.ts`.

See studio-* skills for detailed studio conventions.
