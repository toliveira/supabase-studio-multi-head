# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this repo is

This is the **Supabase Studio multi-head fork** — a Next.js dashboard that manages **multiple isolated Supabase projects** from a single Studio instance. It's a fork of `supabase/supabase` with extra self-hosting features (project orchestration, organizations, members, license tiers, read replicas, hot standby, failover, PocketBase support, pg_dump backups, Cloud→self-hosted migration).

Unusual layout to be aware of:

- The **repo root *is* the Studio app**. Root `package.json` is `name: "studio"`; `pages/`, `components/`, `lib/`, `hooks/`, `state/`, `tests/` all live at the repo root. `pnpm dev` from the root runs `next dev`.
- `apps/`, `packages/`, `blocks/`, `e2e/` are pnpm workspaces (see `pnpm-workspace.yaml`) but the root itself is **not** a workspace member — it's the active app.
- `apps/studio/` *also* exists and looks like a sibling Studio app. Treat the **root** as the source of truth for Studio code unless a path explicitly says `apps/studio/`.
- `multihead/` contains the multi-head-specific Docker stack, the `smh` CLI, and integration scripts. The corresponding server code lives in `lib/api/self-hosted/` at the root.

Requires Node >= 22 (see `.nvmrc`), pnpm 10. `preinstall` enforces pnpm via `only-allow`.

## Commands (run from repo root)

```bash
pnpm install                     # install deps (pnpm-only; npm/yarn blocked by preinstall)
pnpm dev                         # next dev on port 8082 (override with STUDIO_PORT)
pnpm build                       # next build (skips asset upload if SKIP_ASSET_UPLOAD=1)
pnpm start                       # next start on port 8082
pnpm lint                        # eslint .
pnpm typecheck                   # next typegen + tsc --noEmit
pnpm test                        # vitest --run --coverage
pnpm test:watch                  # vitest watch
pnpm test:ui                     # vitest --ui
pnpm test:update                 # update snapshots
```

Running a single test file or pattern:

```bash
pnpm vitest run path/to/file.test.ts
pnpm vitest run -t "pattern matching test name"
pnpm vitest run lib/api/self-hosted/    # whole directory
```

GraphQL / Deno type regeneration (only when schemas change):

```bash
pnpm build:graphql-types         # downloads schema + runs codegen
pnpm build:deno-types
```

AI evals (Braintrust):

```bash
pnpm evals:setup                 # copies libpg-query.wasm into evals/
pnpm evals:run                   # run without sending logs
pnpm evals:upload                # run + upload to Braintrust
```

ESLint rule ratcheting (the codebase incrementally tightens specific rules — never *loosen* the baselines):

```bash
pnpm lint:ratchet                # checks ratchet rules haven't regressed
pnpm lint:ratchet:type-checks    # studio/require-safe-sql-fragment ratchet
```

Baselines live in `.github/eslint-rule-baselines.json`. Ratcheted rules include `react-hooks/exhaustive-deps`, `import/no-anonymous-default-export`, `@tanstack/query/exhaustive-deps`, `@typescript-eslint/no-explicit-any`, `no-restricted-imports`, `no-restricted-exports`, `react/no-unstable-nested-components`, and `studio/require-safe-sql-fragment`.

## Multi-head stack (separate from Studio dev loop)

`multihead/` contains the production Docker stack and tooling. **It is independent of `pnpm dev`** — you only need it when testing the actual multi-project orchestration end-to-end.

```bash
# Spin up the full stack (Studio + Postgres + auth + storage + multi-head wiring)
bash multihead/start.sh

# CLI for project/org/member/replica/standby/failover/license/backup management
node multihead/cli/smh.mjs --help

# E2E test against a running stack
node multihead/tests/test-cluster-failover.mjs

# Unit tests for self-hosted server code (health poller, failover, cluster manager)
pnpm vitest run lib/api/self-hosted/
```

See `multihead/README.md` for the full deployment matrix (new install vs. overlay onto existing Supabase docker stack vs. importing a remote stack), Authelia 2FA, license tiers, and HA topology. See the top-level `README.md` for the user-facing multi-head feature list and `smh` reference.

## Architecture

### Studio app (root)

Next.js **pages router**, React 18, TypeScript, Tailwind. Built with Turbopack disabled (uses webpack via `next.config.js`).

- `pages/` — routes and API handlers. API handlers under `pages/api/`.
- `components/` — feature-organized React components. Co-locate sub-components with their parent; **avoid barrel re-export files**.
- `lib/` — non-React utilities, API clients, constants, and helpers. **`lib/api/self-hosted/`** is the multi-head server-side core: project orchestrator, project registry (`projects.json`), JWT generator, docker client, failover/cluster/replication managers, license verification, health poller, migration runner.
- `hooks/` — shared React hooks.
- `data/` — TanStack Query hook layer. ~100 subdirectories, one per domain (auth, tables, snippets, projects, etc.). Each typically exports `useXxxQuery`/`useXxxMutation` plus a query-key factory.
- `state/` — Valtio stores (global UI state outside of TanStack Query's server cache).
- `app/` — present but the project is primarily pages-router. Check before adding new app-router code.
- `tests/` — vitest unit and component tests. Mirrors source structure (`tests/components/...`, `tests/lib/...`, `tests/features/...`). Setup files in `tests/setup/`.
- `i18n/` — locale JSON files.

### Workspaces (`apps/`, `packages/`, `blocks/`, `e2e/`)

Most shared code is consumed from the catalog and workspace packages: `ui`, `ui-patterns`, `common`, `icons`, `shared-data`, `config`, `api-types`, `@supabase/pg-meta`, `ai-commands`, `dev-tools`. Don't duplicate primitives in the root — import from these.

- `apps/studio/` and other `apps/*` exist but aren't part of the primary dev loop here. The active Studio code is at the root.
- `e2e/studio/` is the Playwright suite (run from inside that directory).

### Multi-head server architecture

When a request hits the multi-head API:

1. `lib/api/self-hosted/project-orchestrator.ts` is the entry point for project lifecycle (create / start / stop / delete).
2. `project-registry.ts` reads/writes `projects.json` under `STUDIO_DATA_DIR`. This file is the source of truth for what projects exist, their ports, refs, replica/standby topology, license tier, etc.
3. `docker-client.ts` shells out to the host's `docker` CLI via the mounted docker socket — there is **no Docker-in-Docker**. The compose template is baked into the image at `/app/supabase-docker/docker-compose.yml` (override with `SUPABASE_COMPOSE_FILE`).
4. `jwt-generator.ts` mints per-project `JWT_SECRET`/`ANON_KEY`/`SERVICE_ROLE_KEY` from `crypto.randomBytes`. **Standbys and replicas inherit the primary's keys** so client tokens remain valid after failover.
5. The health poller runs every 30 s in-process, polling `/rest/v1/` on each project's Kong. Three consecutive failures on a primary/master triggers `failover` (standby) or `cluster-failover` (replica). Standbys/replicas are polled but never promoted by the poller itself.
6. License gating: tier (free/business/enterprise) is verified locally via HMAC-signed JWT (`MULTI_HEAD_LICENSE_SECRET`). Business/Enterprise endpoints return 402 on free tier. There's a 7-day grace period if the (optional) license server is unreachable.

Port allocation for new projects: each new project gets a `+10` port block (Kong 8000→8010→8020, Postgres 5432→5442, etc.). Standby = `+20`, replica rank N = `+30 + (N-1)*10`.

### Auth modes

- **Default**: Studio runs with no user auth (self-hosted bypass).
- **GoTrue**: set `NEXT_PUBLIC_STUDIO_AUTH=gotrue` + `STUDIO_GOTRUE_SERVICE_KEY`. On first start Studio redirects to `/setup` to bootstrap an initial Owner. Members are stored in `members.json` linked by GoTrue user ID.
- `NEXT_PUBLIC_GOTRUE_URL` is **baked at build time** (Next.js public env). If it's unset at build, the bundle falls back to `window.location.origin + '/auth/v1'` — this is the common cause of "POST /undefined/token 404" sign-in failures. Fix by rebuilding with `--build-arg NEXT_PUBLIC_GOTRUE_URL=…` or relying on the runtime origin fallback.

## Conventions

**Pages router.** Co-locate sub-components with their parent component. Avoid barrel re-export files (`index.ts` re-exports) — `eslint-plugin-barrel-files` enforces this.

**UI imports** — import primitives from the `'ui'` workspace package. Form primitives have `_Shadcn_`-suffixed variants — check `packages/ui/index.tsx` (or the package's exports) before creating new primitives.

**Styling** — Tailwind only, semantic tokens (`bg-muted`, `text-foreground-light`, etc.). No hardcoded color values.

**SQL safety** — the `studio/require-safe-sql-fragment` ESLint rule (in `eslint-rules/`) is ratcheted. SQL strings sent to pg-meta must use the tagged `safeSql\`…\`` helper or whitelisted helpers. Don't bypass this rule.

**Testing pattern** — push logic out of components into `ComponentName.utils.ts` and unit-test it. Reserve component tests for complex UI interactions. See `.github/instructions/studio-testing.instructions.md` and the `studio-testing` skill.

**E2E selectors** (Playwright) — priority order: `getByRole` with accessible name → `getByTestId` → `getByText` (exact) → `locator` CSS as a last resort. **Never** use `waitForTimeout`, XPath, or `locator('..')` parent traversal. See `.github/instructions/studio-e2e-tests.instructions.md`.

**Telemetry / error handling / composition patterns** — see corresponding skill files (`telemetry-standards`, `studio-error-handling`, `studio-ui-patterns`) and `.github/instructions/`.

## CI review policy (`.github/copilot-instructions.md`)

CI already enforces formatting (Prettier), linting (ESLint with auto-fix), typecheck, and typo detection. When reviewing code or writing PRs, **don't waste comments on those topics**. Comment only on logic bugs, security issues, race conditions, data-loss risks, and API-contract violations — at >85% confidence. Be advisory, not prescriptive.

## Skills

Project skills live in `.claude/skills/`: `studio-best-practices`, `studio-queries`, `studio-ui-patterns`, `studio-error-handling`, `studio-testing`, `studio-e2e-tests`, `telemetry-standards`, `vitest`, `use-static-effect-event`, `vercel-composition-patterns`. Path-scoped variants of these (applied automatically to `apps/studio/**` files in PR review) are in `.github/instructions/`.
