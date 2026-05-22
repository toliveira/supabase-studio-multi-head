# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

**Supabase Studio — multi-head fork.** A self-hosted Studio that manages multiple isolated Supabase projects (each a Docker Compose stack) from one dashboard. Built on upstream `supabase/supabase/apps/studio`.

Unlike upstream, **the Studio Next.js app is the repo root** (`package.json` is named `studio`), not nested under `apps/studio`. The `apps/` and `packages/` folders inside this repo hold sibling apps and shared workspaces consumed by Studio. The multi-head additions (CLI, compose overlays, OAuth/storage/migration tooling) live in `multihead/`.

- pnpm 10 + Turborepo, Node ≥ 22 (`.nvmrc`)
- Next.js (pages router primarily, with some `app/` API routes), React 18, TypeScript

## Repo layout

| Path             | Purpose                                                                               |
| ---------------- | ------------------------------------------------------------------------------------- |
| `pages/`         | Next.js pages router (Studio routes — primary surface)                                |
| `app/api/`       | App-router API handlers                                                               |
| `components/`    | Studio UI — `interfaces/` (feature pages), `layouts/`, `ui/`, `ui-patterns/`, `grid/` |
| `data/`          | TanStack Query hooks + API clients (one folder per resource, `*-keys.ts` per folder)  |
| `state/`         | Valtio stores                                                                         |
| `hooks/`         | Shared React hooks                                                                    |
| `lib/`           | Non-React utilities (api, auth, constants, etc.)                                      |
| `pages/api/`     | Pages-router API routes (proxy to platform / pg-meta)                                 |
| `multihead/`     | Multi-head fork additions: `cli/smh.mjs`, docker-compose overlays, integration tests  |
| `apps/`          | Sibling apps: `studio` (build artifacts), `docs`, `www`, `design-system`, `learn`, `ui-library`, `lite-studio` |
| `packages/`      | Shared workspaces: `ui`, `ui-patterns`, `common`, `shared-data`, `pg-meta`, `ai-commands`, `api-types`, `config`, `icons`, `eslint-config-supabase`, `tsconfig`, `dev-tools` |
| `tests/`         | Vitest unit/integration tests + setup (`tests/vitestSetup.ts`, `tests/setup/*`)        |
| `e2e/studio/`    | Playwright E2E tests                                                                  |
| `scripts/`       | Codegen, env, deno-types, GraphQL schema download, eslint ratchet                     |

## Commands

All commands run from the **repo root** (where this CLAUDE.md lives one level up):

```bash
pnpm install                          # install everything
pnpm dev                              # Studio dev server (port $STUDIO_PORT or 8082)
pnpm build                            # next build (also runs upload-static-assets.sh unless SKIP_ASSET_UPLOAD=1)
pnpm start                            # production server on 8082

pnpm lint                             # eslint .
pnpm typecheck                        # runs `next typegen` then `tsc --noEmit`
pnpm test                             # vitest --run --coverage
pnpm test:watch                       # vitest watch
pnpm test:ui                          # vitest --ui
pnpm test -- path/to/file.test.tsx    # run a single test file
pnpm test -- -t "name of test"        # run by test-name pattern

pnpm build:graphql-types              # download schema + codegen
pnpm build:deno-types
```

E2E lives in `e2e/studio/` and uses Playwright (run from there).

The repo enforces `pnpm` (`preinstall: only-allow pnpm`). Don't introduce `npm`/`yarn` lockfiles.

## Architecture essentials

**Data layer.** Every server resource has a folder in `data/<resource>/` containing TanStack Query hooks and a `*-keys.ts` query-key factory. New API calls follow this pattern — see the `studio-queries` skill for the canonical shape (`use-foo-query.ts`, `use-foo-mutation.ts`, key factory, types).

**State.** Global UI state lives in `state/` as Valtio stores (`app-state.ts`, `ai-assistant-state.tsx`, etc.). Server state goes through TanStack Query, not stores.

**UI primitives.** Import from `'ui'` (the workspace, `packages/ui`). Form primitives use `_Shadcn_`-suffixed variants. Check `packages/ui/src/index.tsx` before adding new primitives.

**Styling.** Tailwind only, semantic tokens (`bg-muted`, `text-foreground-light`, `border-default`). No hardcoded colors.

**Conventions.**
- Co-locate sub-components with the page/feature that owns them under `components/interfaces/<feature>/`.
- Avoid barrel re-export files (`eslint-plugin-barrel-files` enforces this).
- Pages router is primary; only use `app/api/` for new API handlers when you specifically need app-router features.

**Multi-head specifics.**
- `NEXT_PUBLIC_GOTRUE_URL` is baked into the browser bundle at build time. If it's missing, the bundle falls back to `${window.location.origin}/auth/v1`. Setting it via runtime Docker env on a pre-built image **does not work** — pass it as `--build-arg` if customizing.
- `multihead/cli/smh.mjs` is the CLI that drives project creation, backups, migrations, replicas, etc. Read README.md for the full surface area before changing it.

## Lint ratchets

`pnpm lint:ratchet` enforces that the count of violations for specific rules (`react-hooks/exhaustive-deps`, `@typescript-eslint/no-explicit-any`, `no-restricted-imports`, `react/no-unstable-nested-components`, etc.) never increases. New code must not add to those counts. `lint:ratchet:type-checks` does the same for the type-aware `studio/require-safe-sql-fragment` rule (run separately because it's slow).

## Path-scoped rules to honor

`.github/instructions/*.instructions.md` (used by Copilot review and the matching `studio-*` skills) define rules for: telemetry (`studio-telemetry`), testing (`studio-testing`), error handling (`studio-error-handling`), e2e (`studio-e2e-tests`), composition (`studio-composition-patterns`), shadcn/Radix usage (`studio-shadcn-components`). Use the corresponding `studio-*` skills via the Skill tool when working in those areas — they encode the rules in detail.

`.github/copilot-instructions.md` review policy applies to PR review: comment only on logic bugs, security, race conditions, data loss, or API contract violations at >85% confidence. Don't comment on formatting, lint, types, typos, imports, or a11y on shadcn primitives (CI already checks these).

## What to read before editing

- A query/mutation in `data/`? Look at a neighboring `data/<resource>/` folder for the pattern, then invoke the `studio-queries` skill.
- A page route? Find its file under `pages/` first; many pages compose `components/interfaces/<feature>/` parts.
- Studio UI patterns (forms, dialogs, dropdowns)? Invoke the `studio-ui-patterns` skill.
- Anything in `multihead/`? Start with `README.md` and `multihead/README.md` — the multi-head feature set is large and not obvious from the code alone.
