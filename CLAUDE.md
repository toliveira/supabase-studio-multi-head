# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repo identity

This is **Supabase Studio — Multi-Head Fork** (`supabase-studio-multi-head`), a fork of `apps/studio` from the upstream Supabase monorepo that adds support for managing multiple isolated Supabase projects from a single Studio instance. The fork's distinguishing features (multi-project orchestration, the `smh` CLI, PocketBase modes, backups/restore, cluster mode) live in `multihead/` and in studio-side code paths gated on multi-head functionality.

## Working-directory layout — read this first

The repo root is **both** the Studio Next.js app **and** a Turborepo wrapper. This is unusual and easy to mistake.

- Root `package.json` has `"name": "studio"` and contains the actual Next.js scripts (`dev`, `build`, `test`, `typecheck`, `lint`). **Run these from the repo root, not from `apps/studio`.**
- Studio source lives at the root: `pages/`, `components/`, `lib/`, `hooks/`, `state/`, `data/`, `styles/`, `types/`, `i18n/`, `tests/`.
- `apps/studio/` exists but contains only a partial mirror (Dockerfile, eslint, evals, fonts, instrumentation files) — it is **not** where day-to-day Studio work happens in this fork.
- `apps/{www,docs,learn,design-system,lite-studio,ui-library}` and `packages/*` are upstream monorepo siblings used as workspace dependencies (`common`, `ui`, `ui-patterns`, `icons`, `pg-meta`, `api-types`, `ai-commands`, `shared-data`, `config`, `tsconfig`).
- `multihead/` holds the fork-specific assets: `smh.mjs` (the `smh` CLI), `docker-compose.yml`, `docker-compose.overlay.yml`, `cli/`, `utils/`, `tests/`, `volumes/`. Multi-head documentation is in `README.md` (fork-specific) and `multihead/README.md`.
- `.claude/CLAUDE.md` exists and is auto-loaded into context — it currently describes a generic Supabase monorepo (`pnpm dev:studio`, etc.) and **does not match this fork's actual scripts**. Prefer the commands in this file.

## Common commands (run from repo root)

```bash
pnpm install                # install dependencies (Node >= 22 required by .nvmrc)
pnpm dev                    # Next.js dev server on $STUDIO_PORT (default 8082)
pnpm build                  # next build + asset upload (set SKIP_ASSET_UPLOAD=1 to skip)
pnpm test                   # vitest --run --coverage (CI mode)
pnpm test:watch             # vitest in watch mode
pnpm test:ui                # vitest UI
pnpm test:update            # update snapshots
pnpm lint                   # eslint .
pnpm typecheck              # next typegen, then tsc --noEmit
```

Run a single test file or a name pattern:

```bash
pnpm vitest run path/to/file.test.ts
pnpm vitest run -t "name pattern"
```

E2E tests (Playwright) live in `apps/studio/tests/` and `apps/studio/e2e/` per upstream conventions — there is no `e2e/studio` workspace in this fork.

GraphQL & Deno types (regenerate when their sources change):

```bash
pnpm build:graphql-types          # one-shot
pnpm build:graphql-types:watch    # watch mode
pnpm build:deno-types
```

Evals (Braintrust):

```bash
pnpm evals:setup    # copy libpg-query.wasm into evals/
pnpm evals:run      # local run, no log upload
pnpm evals:upload   # upload run logs
```

ESLint ratcheting (don't add new violations of allow-listed rules):

```bash
pnpm lint:ratchet                 # studio rules
pnpm lint:ratchet:type-checks     # type-aware rules (e.g., require-safe-sql-fragment)
```

## Multi-head specifics

- The `smh` CLI is implemented in `multihead/smh.mjs`. Full subcommand reference is in `README.md` (root).
- Each managed project gets its own Docker Compose stack (Postgres, GoTrue, Storage, Kong). Embedded mode adds a database inside an existing project's Postgres without spinning new containers. PocketBase mode (full or embedded) is a parallel deployment path.
- `STUDIO_URL`, `DASHBOARD_USERNAME`, `DASHBOARD_PASSWORD` configure the smh CLI's target Studio.
- `NEXT_PUBLIC_GOTRUE_URL` is **baked into the browser bundle at build time** — passing it at runtime to a pre-built image does nothing. The image ships a fallback that derives it from `window.location.origin + '/auth/v1'`. Rebuild with `--build-arg NEXT_PUBLIC_GOTRUE_URL=...` for non-standard routing. See "Troubleshooting" in `README.md`.

## Architecture notes

**Next.js Pages Router.** Routes live in `pages/`. API routes under `pages/api/` proxy a mix of Postgres (via `pg-meta`), GoTrue, Storage, and the management API. Top-level pages dispatch by project ref pulled from the URL.

**Data layer.** TanStack Query is the source of truth for server state. Per-feature query/mutation hooks live in `data/<feature>/*` (e.g., `data/database-functions/`). React Query keys are co-located. Cross-feature client state lives in `state/` as Valtio stores (e.g., `app-state.ts`, `tabs.tsx`, `sql-editor-v2.ts`).

**Error handling.** Errors flow `handleError() → typed subclass → React Query catches → ErrorMatcher does an O(1) lookup on `errorType` → renders troubleshooting`. Regex patterns belong in `data/error-patterns.ts`, error classes in `types/api-errors.ts`, and the mapping table in `error-mappings.tsx`. Pass the **full error object**, not `error.message`, to `<ErrorMatcher>`. See `.github/instructions/studio-error-handling.instructions.md`.

**UI primitives.** Import from `'ui'` (workspace package `packages/ui`). Form primitives use `_Shadcn_`-suffixed variants. Check `packages/ui/index.tsx` before introducing a new primitive. Shadcn/Radix components already handle accessibility — don't add ARIA props the primitive provides (`.github/instructions/studio-shadcn-components.instructions.md`).

**Styling.** Tailwind only. Use semantic tokens (`bg-muted`, `text-foreground-light`) — no hardcoded colors. Config: `tailwind.config.js`.

**Composition.** Prefer compound components and explicit variants over boolean-prop proliferation. Lift state into providers when siblings need access. New code: use `ref` as a regular prop (no `forwardRef`) and `use(Context)` (no `useContext`). See `.github/instructions/studio-composition-patterns.instructions.md`.

**Testing strategy.** Push logic out of components into `ComponentName.utils.ts` next to the component, then unit-test it. Component tests are for complex UI only. Vitest config (`vitest.config.ts`) uses `jsdom`, three setup files in `tests/setup/`, and coverage scoped to `lib/**/*.ts`. See `.github/instructions/studio-testing.instructions.md`.

**E2E selectors.** Priority order: `getByRole` with accessible name → `getByTestId` → exact `getByText` → CSS locator (sparingly). Never use `waitForTimeout`, `force: true`, XPath, or `locator('..')`. See `.github/instructions/studio-e2e-tests.instructions.md`.

**Telemetry.** Events are `[object]_[verb]` in `snake_case`. Properties are `camelCase`. Use `useTrack` from `lib/telemetry/track` (do not introduce new `useSendEventMutation` usage). New events need a TS interface in `packages/common/telemetry-constants.ts` with `@group Events` and `@source` JSDoc tags, plus inclusion in the `TelemetryEvent` union. When gating behavior on a PostHog flag, also capture the flag state in telemetry — read raw via `usePHFlag<T>('flag')` and use conditional spread (`...(flagValue !== undefined && { ... })`) so unloaded flags omit the prop rather than reporting `false`. `useFlag` from `common` reads ConfigCat, not PostHog. See `.github/instructions/studio-telemetry.instructions.md`.

## pnpm / monorepo conventions

- pnpm 10, packageManager pinned in root `package.json`. `preinstall` enforces pnpm via `only-allow`.
- Workspace ranges resolve to `apps/*`, `packages/*`, `blocks/*` (declared, may not exist), `e2e/*` (declared, may not exist) per `pnpm-workspace.yaml`.
- The pnpm catalog pins React 18, Next ~16.2, TypeScript ~6.0, Vitest ^3.2, Zod 3.25.76, Tailwind 3.4.1, and key `@supabase/*` SDKs. Reference these via `"catalog:"` in package.json rather than literal versions.
- `minimumReleaseAge: 10080` (7 days) blocks brand-new package versions. The `minimumReleaseAgeExclude` list bypasses this for `@ai-sdk/*`, `@supabase/*`, and security-pinned packages.

## Conventions specific to this codebase

- Co-locate sub-components with their parent. Avoid barrel re-export files — `eslint-plugin-barrel-files` is enforced.
- The `lint:ratchet` rules (`react-hooks/exhaustive-deps`, `import/no-anonymous-default-export`, `@tanstack/query/exhaustive-deps`, `@typescript-eslint/no-explicit-any`, `no-restricted-imports`, `no-restricted-exports`, `react/no-unstable-nested-components`) are allow-listed at current count — don't add new violations.
- The custom `studio/require-safe-sql-fragment` rule (type-aware, see `eslint.type-checks.config.cjs` and `eslint-rules/`) is ratcheted separately. Use the safe SQL fragment helpers rather than string concatenation in SQL.
- Branch naming: `{chore|fix|feature}/{short-name}` per `README.md`.
