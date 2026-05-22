# Schema Analysis & Normalization Tool — Design Spec

## Overview

A cross-project schema analysis feature for Supabase Multi-Head Studio that compares database schemas across all managed projects, identifies similarities and inconsistencies, generates standardization recommendations, and produces migration scripts.

**Route**: `/schema-analysis` (top-level, not project-scoped)

## Architecture

**Hybrid approach**: Core logic lives in `lib/schema-analysis/` as pure, testable functions. API routes in `pages/api/schema-analysis/` are thin wrappers that invoke the lib functions and handle mock/real data switching. UI fetches via React Query hooks in `data/schema-analysis/`.

```
UI (components/schema-analysis/)
  → React Query hooks (data/schema-analysis/)
    → API routes (pages/api/schema-analysis/)
      → Core logic (lib/schema-analysis/)
        → Mock data (__mocks__/data.ts) or real DB via pg-meta
```

## File Structure

### Core Logic — `lib/schema-analysis/`

| File | Responsibility |
|------|---------------|
| `types.ts` | All type definitions (TableSchema, ColumnDefinition, SimilarityPair, Recommendation, etc.) |
| `similarity.ts` | Similarity detection: name (Levenshtein + synonym map), structure (column overlap, types, constraints), semantic (FK patterns, naming conventions). Weighted composite: 30% name, 50% structure, 20% semantic. |
| `schema-analyzer.ts` | Schema fetching, caching (Map-based with 1hr TTL), cross-project comparison orchestration. |
| `recommendation-engine.ts` | Generates prioritized recommendations from similarity pairs: rename, add table, column standardization, consolidation. |
| `migration-generator.ts` | SQL migration generation, rollback script generation, syntax validation. |
| `__mocks__/data.ts` | Copy of `MOCK_DATA_FOR_TESTING.ts` from repo root. |

### API Routes — `pages/api/schema-analysis/`

| Route | Method | Purpose |
|-------|--------|---------|
| `analyze.ts` | GET | Fetch all project schemas, run analysis, return similarity pairs |
| `matrix.ts` | GET | Return matrix data (projects × tables with existence/similarity) |
| `recommendations.ts` | GET | Return prioritized recommendations |
| `generate-migration.ts` | POST | Generate migration + rollback SQL for a given recommendation |
| `apply-migration.ts` | POST | Validate and execute migration (dry-run or live) |

All routes use `apiWrapper()`. In development mode (`NODE_ENV === 'development'`), routes return mock data instead of querying real databases.

### Data Layer — `data/schema-analysis/`

| File | Purpose |
|------|---------|
| `keys.ts` | React Query key factories |
| `schema-analysis-query.ts` | `useSchemaAnalysisQuery()` — fetches analysis results |
| `schema-matrix-query.ts` | `useSchemaMatrixQuery()` — fetches matrix data |
| `recommendations-query.ts` | `useRecommendationsQuery()` — fetches recommendations |
| `generate-migration-mutation.ts` | `useGenerateMigrationMutation()` — generates migration SQL |
| `apply-migration-mutation.ts` | `useApplyMigrationMutation()` — applies/dry-runs migration |

### UI Components — `components/schema-analysis/`

| Component | Purpose |
|-----------|---------|
| `SchemaAnalysisDashboard.tsx` | Main container: stats bar, tab navigation, orchestrates child components |
| `SchemaMatrix.tsx` | Interactive matrix table: sticky first column, color-coded cells, search/filter |
| `RecommendationsPanel.tsx` | Prioritized recommendation cards with Generate Migration buttons |
| `MigrationPreview.tsx` | SQL preview (migration + rollback), details panel, Dry Run / Apply buttons |
| `ProgressTracker.tsx` | Per-project standardization bars, pending/completed migration counts |

### Page — `pages/schema-analysis/`

| File | Purpose |
|------|---------|
| `index.tsx` | Page component using `DefaultLayout`. Renders `SchemaAnalysisDashboard`. |

## Similarity Algorithm

### Weighted Composite Score

```
totalScore = (nameSimilarity × 0.3) + (structureSimilarity × 0.5) + (semanticSimilarity × 0.2)
```

### Name Similarity (30% weight)

1. Normalize: lowercase, strip underscores/hyphens
2. Exact match → 100%
3. Synonym map check → 90% (e.g., users ↔ user_accounts, products ↔ items, orders ↔ transactions)
4. Levenshtein distance → scaled 0–100%
5. Substring containment bonus (+15%, capped at 100%)

The synonym map is a static dictionary of common DB naming equivalences:
- `users` ↔ `user_accounts`, `accounts`, `members`
- `products` ↔ `items`, `goods`, `inventory`
- `orders` ↔ `transactions`, `purchases`
- Common column equivalences: `email` ↔ `email_address`, `created_at` ↔ `created_timestamp`, `name` ↔ `username` / `account_name`

### Structure Similarity (50% weight)

1. Column count ratio: `min(count1, count2) / max(count1, count2)`
2. Column name overlap: Jaccard coefficient on normalized column name sets
3. Column type matching: for overlapping columns, ratio of matching data types
4. Constraint similarity: PK/FK/UNIQUE pattern matching
5. Index similarity: overlap of indexed column sets

### Semantic Similarity (20% weight)

1. Foreign key relationship pattern similarity
2. Column naming convention consistency (snake_case patterns, prefix patterns)
3. Data type distribution similarity (% of text, numeric, timestamp columns)
4. Timestamp column pattern recognition (`created_at` vs `created_timestamp` vs `created_date`)

### Thresholds

| Score | Classification | Color | Action |
|-------|---------------|-------|--------|
| ≥ 90% | Exact Match | Green | No action needed |
| ≥ 75% | Likely Similar | Yellow | Flagged for review, recommendations generated |
| ≥ 50% | Partial Match | Orange | Optional review |
| < 50% | Different | No highlight | Ignored |

## Recommendation Types

| Type | Badge Color | When Generated | Example |
|------|------------|----------------|---------|
| RENAME | Yellow | Table name differs but structure matches (≥75%) | "Rename user_accounts → users in Project B" |
| ADD TABLE | Red | Table exists in majority of projects but missing in some | "Add orders table to Projects C & D" |
| COLUMNS | Purple | Column names differ between similar tables | "Standardize email_address → email in Project B" |
| CONSOLIDATE | Blue | Multiple tables could be merged | (Less common, lower confidence) |

Each recommendation includes:
- **Confidence**: 70–100% (based on similarity score and cross-project consensus)
- **Effort**: Low (rename only), Medium (rename + column changes), High (new table + FKs)
- **Affected projects**: Which projects need changes
- **Baseline project**: Which project's schema is the "standard" (most common pattern)

## UI Layout

### Dashboard Page (`/schema-analysis`)

**Stats Bar** (top): 4 cards showing:
- Overall standardization % (green Supabase accent)
- Total projects count
- Unique tables count
- Similar pairs above 75% threshold

**Tab Navigation**: Schema Matrix | Recommendations | Progress

(Migration Preview is not a tab — it's a modal/panel that opens when clicking "Generate Migration" on a recommendation card.)

### Schema Matrix Tab

- Interactive HTML table
- Sticky first column (table names)
- Horizontal scroll for projects
- Cells show: ✓ (exact match, green), ⚠ (variant name + similarity %, yellow bg), ✗ (missing, red bg)
- Search bar filters table rows
- Filter dropdown for similarity thresholds

### Recommendations Tab

- Card list, sorted by confidence descending
- Each card: type badge, title, description, confidence/effort/affected projects, "Generate Migration" button
- Clicking "Generate Migration" opens the Migration Preview

### Migration Preview

- Split layout: SQL editor (left, 2/3 width) + details panel (right, 1/3 width)
- Migration script with syntax highlighting (monospace, colored keywords)
- Rollback script below (collapsed by default)
- Details panel: target project, operations count, row impact, FK updates
- Action buttons: "Dry Run" (outline) and "Apply" (green, primary)

### Progress Tab

- Per-project progress bars showing standardization %
- Pending migrations count per project
- Completed migrations history list

## Styling

- Tailwind only, using Supabase Studio semantic tokens (`bg-surface-100`, `bg-surface-200`, `text-foreground`, `text-foreground-light`, `border-default`)
- Supabase green accent: `#3ecf8e` / `text-brand`
- Uses existing `ui` package components: Card, Tabs, Button, Badge, Input, Table primitives
- Dark mode compatible (follows existing theme system)

## Caching

- In-memory Map with 1-hour TTL per project schema
- Cache key: `schema:{projectId}`
- Invalidated on: manual refresh, migration apply
- No persistence across server restarts (acceptable for analysis tool)

## Error Handling

- Connection failures: show per-project error badge, continue with available projects
- Empty projects: show "No tables found" in matrix cells
- Large schemas (100+ tables): pagination in matrix, performance tested via `generateLargeSchema()`
- Migration validation errors: show inline in SQL preview before allowing Apply

## Testing Strategy

- **Unit tests** (`tests/lib/schema-analysis/`): Pure function tests for similarity, recommendations, migration generation. Uses mock data directly. Target >80% coverage.
- **API integration tests** (`tests/pages/api/schema-analysis/`): Each endpoint tested with mock data. Uses MSW for request mocking pattern.
- **Performance test**: `generateLargeSchema(projectId, 100)` must complete analysis in <5 seconds.

## Out of Scope

- Automatic migration execution without user approval
- Real-time schema change detection
- Schema versioning or Git integration
- Non-PostgreSQL support
- AI-powered naming suggestions
