# Cross-Project Schema Analysis & Normalization Tool — Design

**Status:** Draft for implementation
**Date:** 2026-05-22
**Owner:** Studio multi-head

## 1. Problem

Teams running multiple self-hosted Supabase projects via this fork have no way to see how their database schemas diverge across projects, or to normalize them. Drift makes shared tooling fragile (a migration that works on Project A breaks on B), and there is no single place to ask "where is `orders` missing?" or "are `users` and `user_accounts` the same table by different names?"

## 2. Goal

Ship an integrated `/schema-analysis` page that:

- Aggregates table schemas across all managed projects.
- Detects similar tables across projects with a reproducible 0–100 score.
- Surfaces ranked recommendations to standardize (rename, add missing, column mapping, consolidate).
- Generates valid PostgreSQL migration scripts with rollback procedures.
- **Never** executes a destructive operation automatically.

This ships as a frontend feature with pure backend logic, driven by mock data in development and wired through `lib/api/self-hosted/project-registry` for real projects (introspection itself is out of scope — see §10).

## 3. Codebase mapping

The original prompt assumes a generic Next.js 14 App Router project. This repository is different:

| Prompt assumption | Actual |
| --- | --- |
| Next.js 14 App Router, `app/` | Next.js 16 **pages router**, root `pages/` is the live route tree |
| `lib/api/supabase.ts` | Does not exist. Multi-head data lives in `lib/api/self-hosted/` |
| `npm test` / `npm run build` | **pnpm only** (`preinstall` blocks npm). Tests are vitest |
| `components/ui/` shadcn | Canonical primitives are in `packages/ui` (`import { ... } from 'ui'`); local `components/ui/` is supplementary |
| `apps/studio/...` | The root **is** the studio app |

All file paths in this spec use the **real** repo layout.

## 4. Architecture

```
lib/schema-analysis/
  types.ts                      shared types (TableSchema, ColumnDefinition,
                                ForeignKeyConstraint, IndexDefinition,
                                SimilarityPair, Recommendation, MigrationScript,
                                ValidationResult, MatrixCell, Matrix)
  similarity.ts                 pure: name + structure + semantic + composite
  schema-analyzer.ts            introspection + in-memory cache (1h TTL)
  recommendation-engine.ts      pure: schemas + similarities -> Recommendation[]
  migration-generator.ts        pure: Recommendation -> { forward, rollback }
                                + validateMigrationScript()
  source-adapter.ts             chooses mock vs. real registry data
  __mocks__/data.ts             copy of MOCK_DATA_FOR_TESTING.ts with corrected import path

pages/api/schema-analysis/
  analyze.ts                    POST  -> { stats, generatedAt }
  matrix.ts                     GET   -> Matrix
  recommendations.ts            GET   -> Recommendation[]
  generate-migration.ts         POST  -> { forward, rollback, validation }
  apply-migration.ts            POST  -> ValidationResult (dryRun only;
                                non-dry-run returns 501 in dev)

components/schema-analysis/
  SchemaAnalysisDashboard.tsx   composes the page
  SchemaMatrix.tsx              virtualized matrix with @tanstack/react-virtual
  RecommendationsPanel.tsx
  MigrationPreview.tsx          dialog with SQL + rollback + dry-run
  ProgressTracker.tsx           per-project standardization bars

pages/schema-analysis/index.tsx route wrapped by Studio's default layout

hooks/use-schema-analysis-*.ts  thin TanStack Query wrappers

tests/schema-analysis/          unit + integration vitest suite
```

### Data flow (page load)

1. Page mounts; `useMatrixQuery` and `useRecommendationsQuery` fire in parallel.
2. Each API route calls `source-adapter.getAllSchemas()`. In dev (or with `SCHEMA_ANALYSIS_USE_MOCK=1`) this returns mock data; otherwise it reads the project list from `lib/api/self-hosted/project-registry` and returns an empty schema map with a UI hint until real introspection is wired (§10).
3. Pure logic in `lib/schema-analysis/*` computes similarity, matrix, and recommendations.
4. User clicks "Generate Migration" → `POST /api/schema-analysis/generate-migration` → opens `MigrationPreview`.
5. "Dry Run" → `POST /api/schema-analysis/apply-migration { dryRun: true }` returns only a `ValidationResult`. "Apply" is disabled in dev.

### Caching

In-memory `Map<projectId, { schema, expiresAt }>` inside `schema-analyzer.ts`. 1-hour TTL. Per-process; cold serverless starts repopulate from source. `?force=true` on any API bypasses cache.

## 5. Similarity algorithm

Three signals, composed:

- **Name similarity** — normalized Levenshtein on snake-cased identifiers, plus singular/plural and an explicit synonym dictionary (`user↔account`, `product↔item`, `order↔transaction`, `audit↔log`). Returns 0–1.
- **Structure similarity** — Jaccard over `{ column_name }` sets ∪ Jaccard over `{ column_name, normalized_type }` pairs (`bigint↔int8`, `text↔varchar`). Primary-key match adds +0.1 (capped at 1).
- **Semantic similarity** — token-set overlap of column names after stripping common prefixes/suffixes (`_id`, `_at`, `created_`, `email_address→email`, `created_timestamp→created`). Returns 0–1.

**Composite:** `score = round(100 · (0.4·name + 0.4·structure + 0.2·semantic))`. The threshold for "likely similar" is **75**, matching the prompt. Weights are pinned in tests; do not change them without updating tests.

## 6. Recommendation kinds

Discriminated union, no `any`.

| Kind | Trigger | Confidence | Effort |
| --- | --- | --- | --- |
| `rename_table` | similar pair >75% across projects with different names | 70–95% (scales linearly with score from 75→100) | Low if both row counts < 10k, else Medium |
| `column_mapping` | matched tables with column-name or type differences | 75–90% | Medium |
| `add_missing_table` | table exists in ≥2 projects but absent from a third | 80–100% | Low |
| `consolidate` | ≥2 tables within one project >85% similar | 70–85% | High |

Ranked by `confidence × (effort inverse weight)`; ties broken by descending confidence then alpha by description.

## 7. Migration generation

`migration-generator.ts` emits PostgreSQL per kind. All identifiers double-quoted; identifier inputs validated against `/^[a-zA-Z_][a-zA-Z0-9_]*$/` before insertion (security constraint).

- `rename_table` → `ALTER TABLE "old" RENAME TO "new";`; rollback inverts.
- `column_mapping` → `ALTER TABLE … RENAME COLUMN … TO …;` and/or `ALTER COLUMN … TYPE … USING …;`; rollback inverts.
- `add_missing_table` → full `CREATE TABLE` rebuilt from a source schema (columns, NULLability, defaults, PK); rollback is `DROP TABLE`.
- `consolidate` → emits a guarded `ALTER TABLE … RENAME TO old_…;` with a `-- TODO: review` banner. Data merging is out of scope.

`validateMigrationScript(sql) → { valid, errors[], warnings[] }`:

- `pg-minify` strips comments and whitespace; the result must be non-empty.
- Statements split on `;`; each must match an allowlist of leading keywords (`ALTER`, `CREATE`, `DROP`, `COMMENT`).
- Identifiers in the script must all match the safe regex.

We do **not** pull in `libpg-query` for this — it's already a heavy devDep used for evals; loading it in API routes is overkill for the syntactic check required.

## 8. API contract

Errors follow the existing self-hosted convention: `{ error: { message: string } }` with appropriate status code. All endpoints `apiWrapper`-wrapped.

| Method | Path | Body / Query | Response |
| --- | --- | --- | --- |
| `POST` | `/api/schema-analysis/analyze` | `?force=true` optional | `{ stats: {projects, tables, similarPairs, standardizationPct}, generatedAt }` |
| `GET` | `/api/schema-analysis/matrix` | — | `{ projects: string[], tables: string[], cells: MatrixCell[][] }` |
| `GET` | `/api/schema-analysis/recommendations` | — | `Recommendation[]` |
| `POST` | `/api/schema-analysis/generate-migration` | `{ recommendationId }` *or* `Recommendation` | `{ forward, rollback, validation }` |
| `POST` | `/api/schema-analysis/apply-migration` | `{ forward: string, dryRun: boolean }` | `ValidationResult` if `dryRun`; `501` otherwise in dev |

`MatrixCell`: `{ kind: 'exact' | 'variant' | 'missing', tableName?: string, similarity?: number }`.

## 9. UI

`pages/schema-analysis/index.tsx` wraps `<SchemaAnalysisDashboard />` in the same default Studio layout used by `pages/projects.tsx`. Tailwind only; primitives from the `ui` workspace package; tokens like `bg-muted` / `text-foreground-light`.

```
SchemaAnalysisDashboard
├── Header        overall standardization %, last sync, "Refresh" button
├── Stats row     Card×4: projects, tables, similar pairs, pending recs (lucide icons)
├── Tabs
│   ├── Matrix      SchemaMatrix
│   ├── Recs        RecommendationsPanel
│   └── Progress    ProgressTracker
└── MigrationPreview  Dialog, mounted but inactive until a rec is selected
```

- **`SchemaMatrix`** — rows = union of all table names, columns = projects. Cell renders ✓ (exact), ⚠ + score badge (variant; hover tooltip with variant name), ✗ (missing). Filter input filters rows. `@tanstack/react-virtual` for >50 rows. Color-coding uses semantic tokens: green = ≥85, amber = 75–84, red = <75 or missing.
- **`RecommendationsPanel`** — sortable list (default: confidence × inverse-effort). Each row: kind icon, description, confidence chip, effort badge, "Generate Migration" button.
- **`MigrationPreview`** — `ui` `Dialog`, `<pre>` block for SQL (no Monaco — heavy for a preview), shows forward + rollback. "Dry Run" populates a `ValidationResult` block. "Apply" disabled with tooltip.
- **`ProgressTracker`** — per-project `ui` `Progress` bar: `(tables in this project also present in ≥2 other projects) / (total distinct tables)`.

## 10. Out of scope (explicit)

- **Real schema introspection.** The prompt asks for it but this repo has no schema-introspection API in `lib/api/self-hosted/` yet. Wiring pg-meta is a separate piece of work. `source-adapter` exposes the seam; today the non-mock branch returns `{}` and the UI shows "No live schemas available — use development mode to see mock data."
- Automatic / destructive migration execution.
- Non-PostgreSQL databases, cross-database joins, schema versioning, AI naming, compliance checks.

## 11. Constraints honored

- **Performance:** in-process cache; similarity is O(P·T²) per analyze call; `performance.test.ts` asserts 5 projects × 100 tables completes < 5000ms.
- **Data safety:** `apply-migration` only honors `dryRun: true`. Live apply returns 501 in dev.
- **Compatibility:** PostgreSQL 12+ syntax only; no use of features that break older PG.
- **Security:** identifier regex on every emitted name; `pg-minify` strips comments; inputs validated at every API boundary.
- **Integration:** no new env vars required for the dev path. `SCHEMA_ANALYSIS_USE_MOCK=1` is an *optional* escape hatch for tests/non-dev demos.

## 12. Testing

Tests live under `tests/schema-analysis/` so they pick up vitest's coverage `include: ['lib/**/*.ts']`.

| File | Coverage |
| --- | --- |
| `similarity.test.ts` | pinned scores for known pairs from mock data, plus symmetry & identity property tests |
| `recommendation-engine.test.ts` | each kind generated against the 4 mock projects |
| `migration-generator.test.ts` | per-kind snapshot of forward + rollback; `validateMigrationScript` rejects unquoted ids / missing `;` |
| `schema-analyzer.test.ts` | cache hit/miss + TTL expiry via `vi.useFakeTimers()` |
| `api/*.test.ts` | one file per route, using `node-mocks-http` |
| `performance.test.ts` | `generateLargeSchema('p', 100)` × 5 fake projects, full pipeline < 5000ms |

Target ≥ 80% line coverage on `lib/schema-analysis/**`.

## 13. Verification

The original prompt lists `npm` / `npx` commands; the repo only uses pnpm.

| Prompt command | Run instead |
| --- | --- |
| `npx tsc --noEmit` | `pnpm typecheck` |
| `npx eslint …` | `pnpm lint` (run scoped) |
| `npx prettier --check …` | `pnpm exec prettier --check <files>` |
| `npm test …` | `pnpm vitest run <path>` |
| `npm run build` | `pnpm build` (may surface unrelated warnings) |
| `npm start` | `pnpm start` |

## 14. Risks

1. **No real introspection ⇒ feature looks "complete" but is mock-only.** Mitigated by the explicit empty-state in the UI and clear messaging in `source-adapter.ts`.
2. **Similarity score drift.** Mitigated by pinned tests; weights change requires a test update.
3. **Cache races in serverless.** Per-process cache is fine for the studio; if this ever runs in a multi-instance deployment, swap `Map` for a shared cache. Documented in `schema-analyzer.ts`.
4. **`pnpm build` time.** Studio build is heavy. We will run it as the final verification, but pass criterion is "no errors related to schema-analysis modules"; pre-existing warnings are acceptable.

## 15. Acceptance mapping

Every Must-Have in the original prompt maps to an artifact in this design. Specifically: schema introspection (`schema-analyzer.ts`, mock-backed), similarity detection (`similarity.ts`), schema matrix (`SchemaMatrix.tsx` + `/api/.../matrix`), recommendations (`recommendation-engine.ts` + `/api/.../recommendations` + `RecommendationsPanel.tsx`), migration generation (`migration-generator.ts` + `/api/.../generate-migration` + `MigrationPreview.tsx`), UI components (all 5 listed), API endpoints (all 5 listed), type safety (no `any`, strict mode), error handling (`apiWrapper` + UI error states), testing with mock data (full `tests/schema-analysis/` suite).
