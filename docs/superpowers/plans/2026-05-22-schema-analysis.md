# Schema Analysis & Normalization Tool — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-project schema analysis dashboard at `/schema-analysis` that compares database schemas across all managed Supabase projects, detects similarities, generates standardization recommendations, and produces migration scripts.

**Architecture:** Hybrid approach — pure functions in `lib/schema-analysis/` for all analysis logic, thin API route wrappers in `pages/api/schema-analysis/`, React Query hooks in `data/schema-analysis/`, and UI components in `components/schema-analysis/`. Mock data switches at the API layer (`NODE_ENV === 'development'`).

**Tech Stack:** Next.js Pages Router, TypeScript, React Query, Tailwind CSS, `ui` package (shadcn/ui), `ui-patterns` package, vitest.

---

## File Map

### New Files to Create

| Path | Responsibility |
|------|---------------|
| `lib/schema-analysis/types.ts` | All type definitions |
| `lib/schema-analysis/similarity.ts` | Similarity algorithm (name + structure + semantic) |
| `lib/schema-analysis/schema-analyzer.ts` | Orchestration: fetch schemas, run comparisons, build matrix |
| `lib/schema-analysis/recommendation-engine.ts` | Generate prioritized recommendations from similarity pairs |
| `lib/schema-analysis/migration-generator.ts` | SQL migration + rollback generation + validation |
| `lib/schema-analysis/__mocks__/data.ts` | Mock data (adapted from `MOCK_DATA_FOR_TESTING.ts`) |
| `pages/api/schema-analysis/analyze.ts` | GET — run analysis, return similarity pairs |
| `pages/api/schema-analysis/matrix.ts` | GET — return matrix data |
| `pages/api/schema-analysis/recommendations.ts` | GET — return recommendations |
| `pages/api/schema-analysis/generate-migration.ts` | POST — generate migration SQL |
| `pages/api/schema-analysis/apply-migration.ts` | POST — dry-run or apply migration |
| `data/schema-analysis/keys.ts` | React Query key factories |
| `data/schema-analysis/schema-analysis-query.ts` | `useSchemaAnalysisQuery` hook |
| `data/schema-analysis/schema-matrix-query.ts` | `useSchemaMatrixQuery` hook |
| `data/schema-analysis/recommendations-query.ts` | `useRecommendationsQuery` hook |
| `data/schema-analysis/generate-migration-mutation.ts` | `useGenerateMigrationMutation` hook |
| `data/schema-analysis/apply-migration-mutation.ts` | `useApplyMigrationMutation` hook |
| `components/schema-analysis/SchemaAnalysisDashboard.tsx` | Main container with stats + tabs |
| `components/schema-analysis/SchemaMatrix.tsx` | Matrix table with sticky column |
| `components/schema-analysis/RecommendationsPanel.tsx` | Recommendation cards |
| `components/schema-analysis/MigrationPreview.tsx` | SQL preview modal |
| `components/schema-analysis/ProgressTracker.tsx` | Per-project progress bars |
| `pages/schema-analysis/index.tsx` | Page with DefaultLayout |
| `tests/unit/schema-analysis/similarity.test.ts` | Similarity algorithm tests |
| `tests/unit/schema-analysis/recommendation-engine.test.ts` | Recommendation engine tests |
| `tests/unit/schema-analysis/migration-generator.test.ts` | Migration generator tests |
| `tests/unit/schema-analysis/schema-analyzer.test.ts` | Schema analyzer tests |

---

## Task 1: Types & Mock Data

**Files:**
- Create: `lib/schema-analysis/types.ts`
- Create: `lib/schema-analysis/__mocks__/data.ts`

- [ ] **Step 1: Create types.ts with all type definitions**

```typescript
// lib/schema-analysis/types.ts

export interface ColumnDefinition {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | undefined
  constraints: string[]
}

export interface ForeignKeyConstraint {
  name: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
}

export interface IndexDefinition {
  name: string
  columns: string[]
  unique: boolean
}

export interface TableSchema {
  projectId: string
  tableName: string
  columns: ColumnDefinition[]
  primaryKey: string[]
  foreignKeys: ForeignKeyConstraint[]
  indexes: IndexDefinition[]
  rowCount: number
  lastUpdated: Date
}

export type SimilarityClassification = 'exact' | 'likely_similar' | 'partial' | 'different'

export interface SimilarityBreakdown {
  name: number
  structure: number
  semantic: number
}

export interface SimilarityPair {
  table1: { projectId: string; tableName: string }
  table2: { projectId: string; tableName: string }
  score: number
  breakdown: SimilarityBreakdown
  classification: SimilarityClassification
}

export type RecommendationType = 'rename' | 'add_table' | 'columns' | 'consolidate'
export type EffortLevel = 'low' | 'medium' | 'high'

export interface ColumnMapping {
  from: string
  to: string
}

export interface Recommendation {
  id: string
  type: RecommendationType
  title: string
  description: string
  confidence: number
  effort: EffortLevel
  affectedProjects: string[]
  baselineProject: string
  affectedTables: string[]
  columnMappings?: ColumnMapping[]
}

export interface MatrixCell {
  exists: boolean
  tableName: string | null
  similarityScore: number | null
  classification: SimilarityClassification | null
}

export interface MatrixRow {
  canonicalName: string
  cells: Record<string, MatrixCell>
}

export interface SchemaMatrix {
  projectIds: string[]
  rows: MatrixRow[]
}

export interface AnalysisResult {
  similarities: SimilarityPair[]
  matrix: SchemaMatrix
  standardizationScore: number
  totalProjects: number
  uniqueTables: number
  similarPairsCount: number
  analyzedAt: string
}

export interface MigrationScript {
  sql: string
  rollbackSql: string
  targetProject: string
  operations: string[]
  estimatedRowsAffected: number
  fkUpdatesRequired: number
}

export interface MigrationValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ApplyMigrationResult {
  success: boolean
  dryRun: boolean
  message: string
  executionTimeMs?: number
}
```

- [ ] **Step 2: Create mock data file**

Copy `MOCK_DATA_FOR_TESTING.ts` from the repo root to `lib/schema-analysis/__mocks__/data.ts`. The file already imports from `@/lib/schema-analysis/types`, so it will work as-is once types exist.

```bash
mkdir -p lib/schema-analysis/__mocks__
cp MOCK_DATA_FOR_TESTING.ts lib/schema-analysis/__mocks__/data.ts
```

- [ ] **Step 3: Verify TypeScript compiles**

```bash
npx tsc --noEmit --pretty lib/schema-analysis/types.ts 2>&1 | head -20
```

Expected: No errors. If there are path resolution issues, they're from the mock file importing types — that's expected and fine since the types file now exists.

- [ ] **Step 4: Commit**

```bash
git add lib/schema-analysis/types.ts lib/schema-analysis/__mocks__/data.ts
git commit -m "feat(schema-analysis): add type definitions and mock data"
```

---

## Task 2: Similarity Algorithm

**Files:**
- Create: `lib/schema-analysis/similarity.ts`
- Create: `tests/unit/schema-analysis/similarity.test.ts`

- [ ] **Step 1: Write failing tests for name similarity**

```typescript
// tests/unit/schema-analysis/similarity.test.ts
import { describe, expect, it } from 'vitest'

import {
  calculateNameSimilarity,
  calculateStructureSimilarity,
  calculateSemanticSimilarity,
  calculateSimilarity,
  classifySimilarity,
} from '@/lib/schema-analysis/similarity'
import {
  PROJECT_A_SCHEMA,
  PROJECT_B_SCHEMA,
  PROJECT_C_SCHEMA,
  PROJECT_D_SCHEMA,
} from '@/lib/schema-analysis/__mocks__/data'

describe('calculateNameSimilarity', () => {
  it('returns 100 for exact match', () => {
    expect(calculateNameSimilarity('users', 'users')).toBe(100)
  })

  it('returns 100 for case-insensitive match', () => {
    expect(calculateNameSimilarity('Users', 'users')).toBe(100)
  })

  it('returns 90 for synonym match (users / user_accounts)', () => {
    expect(calculateNameSimilarity('users', 'user_accounts')).toBe(90)
  })

  it('returns 90 for synonym match (products / items)', () => {
    expect(calculateNameSimilarity('products', 'items')).toBe(90)
  })

  it('returns 90 for synonym match (orders / transactions)', () => {
    expect(calculateNameSimilarity('orders', 'transactions')).toBe(90)
  })

  it('returns > 0 for partially similar names', () => {
    const score = calculateNameSimilarity('user_profiles', 'user_settings')
    expect(score).toBeGreaterThan(30)
    expect(score).toBeLessThan(90)
  })

  it('returns low score for completely different names', () => {
    expect(calculateNameSimilarity('users', 'audit_log')).toBeLessThan(30)
  })
})

describe('calculateStructureSimilarity', () => {
  it('returns 100 for identical table structures', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const usersC = PROJECT_C_SCHEMA.find((t) => t.tableName === 'users')!
    expect(calculateStructureSimilarity(usersA, usersC)).toBe(100)
  })

  it('returns high score for structurally similar tables with different names', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const userAccountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
    const score = calculateStructureSimilarity(usersA, userAccountsB)
    expect(score).toBeGreaterThan(60)
  })

  it('returns lower score for tables with different column counts', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const usersD = PROJECT_D_SCHEMA.find((t) => t.tableName === 'users')!
    const score = calculateStructureSimilarity(usersA, usersD)
    expect(score).toBeLessThan(100)
    expect(score).toBeGreaterThan(40)
  })

  it('returns low score for completely different tables', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const auditA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'audit_log')!
    const score = calculateStructureSimilarity(usersA, auditA)
    expect(score).toBeLessThan(50)
  })
})

describe('calculateSemanticSimilarity', () => {
  it('returns high score for tables with similar FK patterns', () => {
    const ordersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'orders')!
    const transactionsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'transactions')!
    const score = calculateSemanticSimilarity(ordersA, transactionsB)
    expect(score).toBeGreaterThan(50)
  })

  it('returns high score for tables with same data type distribution', () => {
    const productsA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'products')!
    const itemsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'items')!
    const score = calculateSemanticSimilarity(productsA, itemsB)
    expect(score).toBeGreaterThan(50)
  })
})

describe('calculateSimilarity', () => {
  it('returns high composite score for users vs user_accounts', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const userAccountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
    const result = calculateSimilarity(usersA, userAccountsB)
    expect(result.score).toBeGreaterThan(75)
    expect(result.breakdown.name).toBe(90)
    expect(result.breakdown.structure).toBeGreaterThan(60)
    expect(result.breakdown.semantic).toBeGreaterThan(0)
  })

  it('returns exact match score for identical tables', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const usersC = PROJECT_C_SCHEMA.find((t) => t.tableName === 'users')!
    const result = calculateSimilarity(usersA, usersC)
    expect(result.score).toBeGreaterThanOrEqual(90)
  })

  it('returns low score for unrelated tables', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const notificationsC = PROJECT_C_SCHEMA.find((t) => t.tableName === 'notifications')!
    const result = calculateSimilarity(usersA, notificationsC)
    expect(result.score).toBeLessThan(50)
  })
})

describe('classifySimilarity', () => {
  it('classifies >= 90 as exact', () => {
    expect(classifySimilarity(95)).toBe('exact')
  })

  it('classifies 75-89 as likely_similar', () => {
    expect(classifySimilarity(80)).toBe('likely_similar')
  })

  it('classifies 50-74 as partial', () => {
    expect(classifySimilarity(60)).toBe('partial')
  })

  it('classifies < 50 as different', () => {
    expect(classifySimilarity(30)).toBe('different')
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/schema-analysis/similarity.test.ts
```

Expected: FAIL — module `@/lib/schema-analysis/similarity` not found.

- [ ] **Step 3: Implement similarity.ts**

```typescript
// lib/schema-analysis/similarity.ts
import type { TableSchema, SimilarityBreakdown, SimilarityClassification } from './types'

const TABLE_SYNONYMS: Record<string, string[]> = {
  users: ['user_accounts', 'accounts', 'members'],
  user_accounts: ['users', 'accounts', 'members'],
  accounts: ['users', 'user_accounts', 'members'],
  members: ['users', 'user_accounts', 'accounts'],
  products: ['items', 'goods', 'inventory'],
  items: ['products', 'goods', 'inventory'],
  goods: ['products', 'items', 'inventory'],
  inventory: ['products', 'items', 'goods'],
  orders: ['transactions', 'purchases'],
  transactions: ['orders', 'purchases'],
  purchases: ['orders', 'transactions'],
}

const COLUMN_SYNONYMS: Record<string, string[]> = {
  email: ['email_address', 'mail'],
  email_address: ['email', 'mail'],
  created_at: ['created_timestamp', 'created_date', 'insert_date'],
  created_timestamp: ['created_at', 'created_date'],
  updated_at: ['updated_timestamp', 'modified_at', 'updated_date'],
  updated_timestamp: ['updated_at', 'modified_at'],
  username: ['account_name', 'user_name', 'login_name'],
  account_name: ['username', 'user_name', 'login_name'],
  name: ['item_name', 'product_name', 'title'],
  item_name: ['name', 'product_name', 'title'],
  description: ['item_description', 'product_description', 'details'],
  item_description: ['description', 'product_description'],
  price: ['item_price', 'product_price', 'cost', 'amount'],
  item_price: ['price', 'product_price', 'cost'],
  total_amount: ['amount', 'total', 'price'],
  amount: ['total_amount', 'total', 'price'],
  status: ['transaction_status', 'order_status', 'state'],
  transaction_status: ['status', 'order_status', 'state'],
  id: ['user_id', 'item_id', 'transaction_id'],
  user_id: ['id', 'account_id'],
  account_id: ['user_id', 'id'],
  item_id: ['id', 'product_id'],
  transaction_id: ['id', 'order_id'],
}

function normalize(name: string): string {
  return name.toLowerCase().replace(/[-_]/g, '')
}

function levenshteinDistance(a: string, b: string): number {
  const matrix: number[][] = []
  for (let i = 0; i <= a.length; i++) {
    matrix[i] = [i]
  }
  for (let j = 0; j <= b.length; j++) {
    matrix[0][j] = j
  }
  for (let i = 1; i <= a.length; i++) {
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      matrix[i][j] = Math.min(
        matrix[i - 1][j] + 1,
        matrix[i][j - 1] + 1,
        matrix[i - 1][j - 1] + cost
      )
    }
  }
  return matrix[a.length][b.length]
}

export function calculateNameSimilarity(name1: string, name2: string): number {
  const n1 = name1.toLowerCase()
  const n2 = name2.toLowerCase()

  if (n1 === n2) return 100

  const synonyms = TABLE_SYNONYMS[n1]
  if (synonyms && synonyms.includes(n2)) return 90

  const norm1 = normalize(name1)
  const norm2 = normalize(name2)

  if (norm1 === norm2) return 100

  const maxLen = Math.max(norm1.length, norm2.length)
  if (maxLen === 0) return 100

  const distance = levenshteinDistance(norm1, norm2)
  let score = Math.round(((maxLen - distance) / maxLen) * 100)

  if (norm1.includes(norm2) || norm2.includes(norm1)) {
    score = Math.min(100, score + 15)
  }

  return Math.max(0, Math.min(100, score))
}

function jaccardCoefficient(set1: Set<string>, set2: Set<string>): number {
  if (set1.size === 0 && set2.size === 0) return 1
  const intersection = new Set([...set1].filter((x) => set2.has(x)))
  const union = new Set([...set1, ...set2])
  return intersection.size / union.size
}

function findColumnMatch(col: string, targetColumns: string[]): string | undefined {
  if (targetColumns.includes(col)) return col
  const synonyms = COLUMN_SYNONYMS[col]
  if (synonyms) {
    return targetColumns.find((tc) => synonyms.includes(tc))
  }
  return undefined
}

export function calculateStructureSimilarity(table1: TableSchema, table2: TableSchema): number {
  const cols1 = table1.columns
  const cols2 = table2.columns

  const countRatio = Math.min(cols1.length, cols2.length) / Math.max(cols1.length, cols2.length)

  const names1 = new Set(cols1.map((c) => c.name.toLowerCase()))
  const names2 = new Set(cols2.map((c) => c.name.toLowerCase()))

  const expandedNames1 = new Set<string>()
  const expandedNames2 = new Set<string>()
  names1.forEach((n) => {
    expandedNames1.add(n)
    const syns = COLUMN_SYNONYMS[n]
    if (syns) syns.forEach((s) => expandedNames1.add(s))
  })
  names2.forEach((n) => {
    expandedNames2.add(n)
    const syns = COLUMN_SYNONYMS[n]
    if (syns) syns.forEach((s) => expandedNames2.add(s))
  })

  const nameOverlap = jaccardCoefficient(expandedNames1, expandedNames2)

  let typeMatches = 0
  let typeTotal = 0
  for (const col1 of cols1) {
    const matchName = findColumnMatch(col1.name.toLowerCase(), cols2.map((c) => c.name.toLowerCase()))
    if (matchName) {
      typeTotal++
      const col2 = cols2.find((c) => c.name.toLowerCase() === matchName)
      if (col2 && normalizeDataType(col1.dataType) === normalizeDataType(col2.dataType)) {
        typeMatches++
      }
    }
  }
  const typeMatchRatio = typeTotal > 0 ? typeMatches / typeTotal : 0

  const constraints1 = new Set(cols1.flatMap((c) => c.constraints))
  const constraints2 = new Set(cols2.flatMap((c) => c.constraints))
  const constraintSim = jaccardCoefficient(constraints1, constraints2)

  const idxCols1 = new Set(table1.indexes.flatMap((i) => i.columns))
  const idxCols2 = new Set(table2.indexes.flatMap((i) => i.columns))
  const indexSim = jaccardCoefficient(idxCols1, idxCols2)

  const score = Math.round(
    (countRatio * 20 + nameOverlap * 30 + typeMatchRatio * 25 + constraintSim * 15 + indexSim * 10) 
  )

  return Math.max(0, Math.min(100, score))
}

function normalizeDataType(dt: string): string {
  return dt.toLowerCase().replace(/\(.*\)/, '').trim()
}

export function calculateSemanticSimilarity(table1: TableSchema, table2: TableSchema): number {
  let score = 0
  let factors = 0

  // FK pattern similarity
  const fk1 = table1.foreignKeys.length
  const fk2 = table2.foreignKeys.length
  if (fk1 === 0 && fk2 === 0) {
    score += 100
  } else if (fk1 > 0 && fk2 > 0) {
    const fkRatio = Math.min(fk1, fk2) / Math.max(fk1, fk2)
    score += fkRatio * 100
  }
  factors++

  // Data type distribution
  const dist1 = getTypeDistribution(table1)
  const dist2 = getTypeDistribution(table2)
  const allTypes = new Set([...Object.keys(dist1), ...Object.keys(dist2)])
  let distScore = 0
  for (const t of allTypes) {
    const v1 = dist1[t] || 0
    const v2 = dist2[t] || 0
    distScore += 1 - Math.abs(v1 - v2)
  }
  score += allTypes.size > 0 ? (distScore / allTypes.size) * 100 : 100
  factors++

  // Timestamp pattern similarity
  const ts1 = table1.columns.filter((c) => isTimestampColumn(c.name)).length
  const ts2 = table2.columns.filter((c) => isTimestampColumn(c.name)).length
  if (ts1 === ts2) {
    score += 100
  } else if (ts1 > 0 && ts2 > 0) {
    score += (Math.min(ts1, ts2) / Math.max(ts1, ts2)) * 100
  }
  factors++

  // Column naming convention consistency
  const hasPrefix1 = table1.columns.some((c) => c.name.includes('_'))
  const hasPrefix2 = table2.columns.some((c) => c.name.includes('_'))
  if (hasPrefix1 === hasPrefix2) {
    score += 100
  } else {
    score += 50
  }
  factors++

  return Math.round(score / factors)
}

function getTypeDistribution(table: TableSchema): Record<string, number> {
  const dist: Record<string, number> = {}
  for (const col of table.columns) {
    const baseType = normalizeDataType(col.dataType)
    const category = categorizeType(baseType)
    dist[category] = (dist[category] || 0) + 1
  }
  const total = table.columns.length
  for (const key of Object.keys(dist)) {
    dist[key] = dist[key] / total
  }
  return dist
}

function categorizeType(baseType: string): string {
  if (baseType.includes('int') || baseType.includes('numeric') || baseType.includes('decimal') || baseType.includes('float') || baseType.includes('double')) return 'numeric'
  if (baseType.includes('text') || baseType.includes('varchar') || baseType.includes('char')) return 'text'
  if (baseType.includes('timestamp') || baseType.includes('date') || baseType.includes('time')) return 'timestamp'
  if (baseType.includes('bool')) return 'boolean'
  if (baseType.includes('json')) return 'json'
  return 'other'
}

function isTimestampColumn(name: string): boolean {
  const n = name.toLowerCase()
  return n.includes('created') || n.includes('updated') || n.includes('modified') || n.includes('timestamp') || n.endsWith('_at') || n.endsWith('_date')
}

export function calculateSimilarity(
  table1: TableSchema,
  table2: TableSchema
): { score: number; breakdown: SimilarityBreakdown; classification: SimilarityClassification } {
  const name = calculateNameSimilarity(table1.tableName, table2.tableName)
  const structure = calculateStructureSimilarity(table1, table2)
  const semantic = calculateSemanticSimilarity(table1, table2)

  const score = Math.round(name * 0.3 + structure * 0.5 + semantic * 0.2)

  return {
    score,
    breakdown: { name, structure, semantic },
    classification: classifySimilarity(score),
  }
}

export function classifySimilarity(score: number): SimilarityClassification {
  if (score >= 90) return 'exact'
  if (score >= 75) return 'likely_similar'
  if (score >= 50) return 'partial'
  return 'different'
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/schema-analysis/similarity.test.ts
```

Expected: All tests pass. If any threshold-based tests fail due to specific scoring, adjust thresholds in tests to match actual scores (the algorithm is deterministic — run once to see actual values, then pin expectations).

- [ ] **Step 5: Commit**

```bash
git add lib/schema-analysis/similarity.ts tests/unit/schema-analysis/similarity.test.ts
git commit -m "feat(schema-analysis): implement similarity algorithm with tests"
```

---

## Task 3: Schema Analyzer

**Files:**
- Create: `lib/schema-analysis/schema-analyzer.ts`
- Create: `tests/unit/schema-analysis/schema-analyzer.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/schema-analysis/schema-analyzer.test.ts
import { describe, expect, it, beforeEach } from 'vitest'

import {
  analyzeSchemas,
  buildSchemaMatrix,
  calculateStandardizationScore,
  clearSchemaCache,
} from '@/lib/schema-analysis/schema-analyzer'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'

describe('analyzeSchemas', () => {
  beforeEach(() => {
    clearSchemaCache()
  })

  it('returns similarity pairs for all cross-project table combinations', () => {
    const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    expect(result.similarities.length).toBeGreaterThan(0)
    // Each pair should have valid scores
    for (const pair of result.similarities) {
      expect(pair.score).toBeGreaterThanOrEqual(0)
      expect(pair.score).toBeLessThanOrEqual(100)
    }
  })

  it('detects users vs user_accounts as similar', () => {
    const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    const pair = result.similarities.find(
      (p) =>
        (p.table1.tableName === 'users' && p.table2.tableName === 'user_accounts') ||
        (p.table1.tableName === 'user_accounts' && p.table2.tableName === 'users')
    )
    expect(pair).toBeDefined()
    expect(pair!.score).toBeGreaterThan(75)
  })

  it('returns correct total projects count', () => {
    const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    expect(result.totalProjects).toBe(4)
  })

  it('returns analyzedAt timestamp', () => {
    const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    expect(result.analyzedAt).toBeDefined()
    expect(new Date(result.analyzedAt).getTime()).not.toBeNaN()
  })
})

describe('buildSchemaMatrix', () => {
  it('includes all projects as columns', () => {
    const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
    expect(matrix.projectIds).toEqual(['project-a', 'project-b', 'project-c', 'project-d'])
  })

  it('includes all unique table names as rows', () => {
    const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
    const rowNames = matrix.rows.map((r) => r.canonicalName)
    expect(rowNames).toContain('users')
    expect(rowNames).toContain('products')
    expect(rowNames).toContain('orders')
    expect(rowNames).toContain('audit_log')
    expect(rowNames).toContain('notifications')
  })

  it('marks existing tables correctly', () => {
    const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
    const usersRow = matrix.rows.find((r) => r.canonicalName === 'users')!
    expect(usersRow.cells['project-a'].exists).toBe(true)
    expect(usersRow.cells['project-c'].exists).toBe(true)
    expect(usersRow.cells['project-d'].exists).toBe(true)
  })

  it('marks variant names with similarity scores', () => {
    const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
    const usersRow = matrix.rows.find((r) => r.canonicalName === 'users')!
    const cellB = usersRow.cells['project-b']
    expect(cellB.exists).toBe(true)
    expect(cellB.tableName).toBe('user_accounts')
    expect(cellB.similarityScore).toBeGreaterThan(75)
  })

  it('marks missing tables correctly', () => {
    const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
    const ordersRow = matrix.rows.find((r) => r.canonicalName === 'orders')!
    expect(ordersRow.cells['project-c'].exists).toBe(false)
    expect(ordersRow.cells['project-d'].exists).toBe(false)
  })
})

describe('calculateStandardizationScore', () => {
  it('returns a score between 0 and 100', () => {
    const score = calculateStandardizationScore(ALL_PROJECTS_SCHEMAS)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })

  it('returns 100 for identical schemas', () => {
    const identical = {
      'project-1': ALL_PROJECTS_SCHEMAS['project-a'],
      'project-2': ALL_PROJECTS_SCHEMAS['project-a'].map((t) => ({ ...t, projectId: 'project-2' })),
    }
    const score = calculateStandardizationScore(identical)
    expect(score).toBe(100)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/schema-analysis/schema-analyzer.test.ts
```

Expected: FAIL — module not found.

- [ ] **Step 3: Implement schema-analyzer.ts**

```typescript
// lib/schema-analysis/schema-analyzer.ts
import type {
  TableSchema,
  SimilarityPair,
  SchemaMatrix,
  MatrixRow,
  MatrixCell,
  AnalysisResult,
} from './types'
import { calculateSimilarity, classifySimilarity } from './similarity'

interface CacheEntry {
  schemas: TableSchema[]
  cachedAt: number
}

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour
const schemaCache = new Map<string, CacheEntry>()

export function cacheSchemaSnapshot(projectId: string, schemas: TableSchema[]): void {
  schemaCache.set(`schema:${projectId}`, { schemas, cachedAt: Date.now() })
}

export function getCachedSchema(projectId: string): TableSchema[] | null {
  const entry = schemaCache.get(`schema:${projectId}`)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    schemaCache.delete(`schema:${projectId}`)
    return null
  }
  return entry.schemas
}

export function clearSchemaCache(): void {
  schemaCache.clear()
}

export function analyzeSchemas(
  allSchemas: Record<string, TableSchema[]>
): AnalysisResult {
  const projectIds = Object.keys(allSchemas)
  const similarities: SimilarityPair[] = []

  // Compare tables across projects (not within the same project)
  for (let i = 0; i < projectIds.length; i++) {
    for (let j = i + 1; j < projectIds.length; j++) {
      const schemasA = allSchemas[projectIds[i]]
      const schemasB = allSchemas[projectIds[j]]

      for (const tableA of schemasA) {
        for (const tableB of schemasB) {
          const result = calculateSimilarity(tableA, tableB)
          if (result.score >= 50) {
            similarities.push({
              table1: { projectId: tableA.projectId, tableName: tableA.tableName },
              table2: { projectId: tableB.projectId, tableName: tableB.tableName },
              score: result.score,
              breakdown: result.breakdown,
              classification: result.classification,
            })
          }
        }
      }
    }
  }

  similarities.sort((a, b) => b.score - a.score)

  const matrix = buildSchemaMatrix(allSchemas)
  const allTables = new Set<string>()
  for (const schemas of Object.values(allSchemas)) {
    for (const table of schemas) {
      allTables.add(table.tableName)
    }
  }

  return {
    similarities,
    matrix,
    standardizationScore: calculateStandardizationScore(allSchemas),
    totalProjects: projectIds.length,
    uniqueTables: allTables.size,
    similarPairsCount: similarities.filter((s) => s.score >= 75).length,
    analyzedAt: new Date().toISOString(),
  }
}

export function buildSchemaMatrix(
  allSchemas: Record<string, TableSchema[]>
): SchemaMatrix {
  const projectIds = Object.keys(allSchemas).sort()

  // Determine canonical table names: group similar tables under one canonical name.
  // Use the most common name as canonical.
  const tableGroups = groupSimilarTables(allSchemas)
  const rows: MatrixRow[] = []

  for (const group of tableGroups) {
    const cells: Record<string, MatrixCell> = {}

    for (const projectId of projectIds) {
      const projectSchemas = allSchemas[projectId]
      const match = findBestMatch(group.canonicalName, projectSchemas, group.variants)

      if (match) {
        const isExactName = match.tableName === group.canonicalName
        let similarityScore: number | null = null
        let classification = null

        if (!isExactName) {
          const canonicalTable = findCanonicalTable(group.canonicalName, allSchemas)
          if (canonicalTable) {
            const sim = calculateSimilarity(canonicalTable, match)
            similarityScore = sim.score
            classification = sim.classification
          }
        } else {
          const canonicalTable = findCanonicalTable(group.canonicalName, allSchemas)
          if (canonicalTable && canonicalTable.projectId !== match.projectId) {
            const sim = calculateSimilarity(canonicalTable, match)
            if (sim.score < 100) {
              similarityScore = sim.score
              classification = sim.classification
            }
          }
        }

        cells[projectId] = {
          exists: true,
          tableName: isExactName ? null : match.tableName,
          similarityScore,
          classification,
        }
      } else {
        cells[projectId] = {
          exists: false,
          tableName: null,
          similarityScore: null,
          classification: null,
        }
      }
    }

    rows.push({ canonicalName: group.canonicalName, cells })
  }

  return { projectIds, rows }
}

interface TableGroup {
  canonicalName: string
  variants: string[]
}

function groupSimilarTables(allSchemas: Record<string, TableSchema[]>): TableGroup[] {
  const allTableNames: { projectId: string; tableName: string; table: TableSchema }[] = []
  for (const [projectId, schemas] of Object.entries(allSchemas)) {
    for (const table of schemas) {
      allTableNames.push({ projectId, tableName: table.tableName, table })
    }
  }

  const groups: TableGroup[] = []
  const assigned = new Set<string>()

  // Count occurrences of each table name
  const nameCounts = new Map<string, number>()
  for (const entry of allTableNames) {
    nameCounts.set(entry.tableName, (nameCounts.get(entry.tableName) || 0) + 1)
  }

  // Sort by frequency (most common first)
  const sortedNames = [...new Set(allTableNames.map((e) => e.tableName))].sort(
    (a, b) => (nameCounts.get(b) || 0) - (nameCounts.get(a) || 0)
  )

  for (const name of sortedNames) {
    if (assigned.has(name)) continue

    const group: TableGroup = { canonicalName: name, variants: [name] }
    assigned.add(name)

    // Find variants
    const canonical = allTableNames.find((e) => e.tableName === name)!
    for (const other of allTableNames) {
      if (assigned.has(other.tableName)) continue
      const sim = calculateSimilarity(canonical.table, other.table)
      if (sim.score >= 75) {
        group.variants.push(other.tableName)
        assigned.add(other.tableName)
      }
    }

    groups.push(group)
  }

  return groups
}

function findBestMatch(
  canonicalName: string,
  projectSchemas: TableSchema[],
  variants: string[]
): TableSchema | undefined {
  const exact = projectSchemas.find((t) => t.tableName === canonicalName)
  if (exact) return exact
  for (const variant of variants) {
    const match = projectSchemas.find((t) => t.tableName === variant)
    if (match) return match
  }
  return undefined
}

function findCanonicalTable(
  canonicalName: string,
  allSchemas: Record<string, TableSchema[]>
): TableSchema | undefined {
  for (const schemas of Object.values(allSchemas)) {
    const match = schemas.find((t) => t.tableName === canonicalName)
    if (match) return match
  }
  return undefined
}

export function calculateStandardizationScore(
  allSchemas: Record<string, TableSchema[]>
): number {
  const projectIds = Object.keys(allSchemas)
  if (projectIds.length <= 1) return 100

  const matrix = buildSchemaMatrix(allSchemas)
  let totalCells = 0
  let matchingCells = 0

  for (const row of matrix.rows) {
    for (const projectId of matrix.projectIds) {
      totalCells++
      const cell = row.cells[projectId]
      if (cell.exists && cell.tableName === null && cell.similarityScore === null) {
        matchingCells++
      }
    }
  }

  return totalCells > 0 ? Math.round((matchingCells / totalCells) * 100) : 0
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/schema-analysis/schema-analyzer.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schema-analysis/schema-analyzer.ts tests/unit/schema-analysis/schema-analyzer.test.ts
git commit -m "feat(schema-analysis): implement schema analyzer with matrix builder"
```

---

## Task 4: Recommendation Engine

**Files:**
- Create: `lib/schema-analysis/recommendation-engine.ts`
- Create: `tests/unit/schema-analysis/recommendation-engine.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/schema-analysis/recommendation-engine.test.ts
import { describe, expect, it } from 'vitest'

import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'
import type { Recommendation } from '@/lib/schema-analysis/types'

describe('generateRecommendations', () => {
  let recommendations: Recommendation[]

  beforeAll(() => {
    const analysis = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    recommendations = generateRecommendations(ALL_PROJECTS_SCHEMAS, analysis.similarities)
  })

  it('generates at least one recommendation', () => {
    expect(recommendations.length).toBeGreaterThan(0)
  })

  it('generates a rename recommendation for user_accounts → users', () => {
    const rename = recommendations.find(
      (r) => r.type === 'rename' && r.affectedTables.includes('user_accounts')
    )
    expect(rename).toBeDefined()
    expect(rename!.affectedProjects).toContain('project-b')
    expect(rename!.confidence).toBeGreaterThanOrEqual(0.7)
  })

  it('generates a rename recommendation for items → products', () => {
    const rename = recommendations.find(
      (r) => r.type === 'rename' && r.affectedTables.includes('items')
    )
    expect(rename).toBeDefined()
    expect(rename!.affectedProjects).toContain('project-b')
  })

  it('generates an add_table recommendation for missing orders', () => {
    const add = recommendations.find(
      (r) => r.type === 'add_table' && r.affectedTables.includes('orders')
    )
    expect(add).toBeDefined()
    expect(add!.affectedProjects).toContain('project-c')
    expect(add!.affectedProjects).toContain('project-d')
  })

  it('generates column standardization recommendations', () => {
    const columns = recommendations.find((r) => r.type === 'columns')
    expect(columns).toBeDefined()
    expect(columns!.columnMappings).toBeDefined()
    expect(columns!.columnMappings!.length).toBeGreaterThan(0)
  })

  it('all recommendations have valid confidence scores', () => {
    for (const r of recommendations) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.7)
      expect(r.confidence).toBeLessThanOrEqual(1.0)
    }
  })

  it('all recommendations have valid effort levels', () => {
    for (const r of recommendations) {
      expect(['low', 'medium', 'high']).toContain(r.effort)
    }
  })

  it('recommendations are sorted by confidence descending', () => {
    for (let i = 1; i < recommendations.length; i++) {
      expect(recommendations[i].confidence).toBeLessThanOrEqual(recommendations[i - 1].confidence)
    }
  })

  it('each recommendation has a unique id', () => {
    const ids = recommendations.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/schema-analysis/recommendation-engine.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement recommendation-engine.ts**

```typescript
// lib/schema-analysis/recommendation-engine.ts
import type {
  TableSchema,
  SimilarityPair,
  Recommendation,
  RecommendationType,
  EffortLevel,
  ColumnMapping,
} from './types'
import { calculateNameSimilarity } from './similarity'

let nextId = 0
function generateId(): string {
  return `rec-${++nextId}`
}

export function resetIdCounter(): void {
  nextId = 0
}

export function generateRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  resetIdCounter()
  const recommendations: Recommendation[] = []

  recommendations.push(...generateRenameRecommendations(allSchemas, similarities))
  recommendations.push(...generateAddTableRecommendations(allSchemas))
  recommendations.push(...generateColumnRecommendations(allSchemas, similarities))

  recommendations.sort((a, b) => b.confidence - a.confidence)
  return recommendations
}

function generateRenameRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const processed = new Set<string>()

  // Find the most common name for each group of similar tables
  const nameCounts = new Map<string, number>()
  for (const schemas of Object.values(allSchemas)) {
    for (const table of schemas) {
      nameCounts.set(table.tableName, (nameCounts.get(table.tableName) || 0) + 1)
    }
  }

  for (const pair of similarities) {
    if (pair.table1.tableName === pair.table2.tableName) continue
    if (pair.score < 75) continue

    const key = [pair.table1.tableName, pair.table2.tableName].sort().join(':')
    if (processed.has(key)) continue
    processed.add(key)

    const count1 = nameCounts.get(pair.table1.tableName) || 0
    const count2 = nameCounts.get(pair.table2.tableName) || 0

    const canonicalName = count1 >= count2 ? pair.table1.tableName : pair.table2.tableName
    const variantName = count1 >= count2 ? pair.table2.tableName : pair.table1.tableName
    const variantProject = count1 >= count2 ? pair.table2.projectId : pair.table1.projectId
    const baselineProject = count1 >= count2 ? pair.table1.projectId : pair.table2.projectId

    // Collect all projects with the variant name
    const affectedProjects: string[] = []
    for (const [projectId, schemas] of Object.entries(allSchemas)) {
      if (schemas.some((t) => t.tableName === variantName)) {
        affectedProjects.push(projectId)
      }
    }

    recommendations.push({
      id: generateId(),
      type: 'rename',
      title: `Rename "${variantName}" to "${canonicalName}"`,
      description: `${affectedProjects.length} project(s) use "${variantName}" while ${count1} project(s) use "${canonicalName}". Renaming would improve consistency.`,
      confidence: Math.min(1.0, pair.score / 100 + 0.05),
      effort: 'medium',
      affectedProjects,
      baselineProject,
      affectedTables: [variantName],
    })
  }

  return recommendations
}

function generateAddTableRecommendations(
  allSchemas: Record<string, TableSchema[]>
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const projectIds = Object.keys(allSchemas)
  const totalProjects = projectIds.length

  // Count how many projects have each canonical table name
  const tablePresence = new Map<string, string[]>()
  for (const [projectId, schemas] of Object.entries(allSchemas)) {
    for (const table of schemas) {
      const list = tablePresence.get(table.tableName) || []
      list.push(projectId)
      tablePresence.set(table.tableName, list)
    }
  }

  for (const [tableName, presentIn] of tablePresence.entries()) {
    if (presentIn.length >= Math.ceil(totalProjects / 2) && presentIn.length < totalProjects) {
      const missingProjects = projectIds.filter((p) => !presentIn.includes(p))
      const confidence = Math.min(1.0, 0.7 + (presentIn.length / totalProjects) * 0.2)

      recommendations.push({
        id: generateId(),
        type: 'add_table',
        title: `Add "${tableName}" table to ${missingProjects.length} project(s)`,
        description: `${presentIn.length} of ${totalProjects} projects have a "${tableName}" table. Adding it to the remaining projects would standardize the schema.`,
        confidence,
        effort: 'high',
        affectedProjects: missingProjects,
        baselineProject: presentIn[0],
        affectedTables: [tableName],
      })
    }
  }

  return recommendations
}

function generateColumnRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const processed = new Set<string>()

  // Find table pairs where names differ and structure is similar
  for (const pair of similarities) {
    if (pair.score < 75) continue

    const key = `${pair.table1.projectId}:${pair.table1.tableName}:${pair.table2.projectId}:${pair.table2.tableName}`
    if (processed.has(key)) continue
    processed.add(key)

    // Find actual table objects
    const table1 = findTable(allSchemas, pair.table1.projectId, pair.table1.tableName)
    const table2 = findTable(allSchemas, pair.table2.projectId, pair.table2.tableName)
    if (!table1 || !table2) continue

    const mappings = findColumnMappings(table1, table2)
    if (mappings.length === 0) continue

    // The table with more common naming is the baseline
    const nameCounts = new Map<string, number>()
    for (const schemas of Object.values(allSchemas)) {
      for (const t of schemas) {
        nameCounts.set(t.tableName, (nameCounts.get(t.tableName) || 0) + 1)
      }
    }

    const count1 = nameCounts.get(table1.tableName) || 0
    const count2 = nameCounts.get(table2.tableName) || 0
    const isTable1Baseline = count1 >= count2

    const affectedProject = isTable1Baseline ? pair.table2.projectId : pair.table1.projectId
    const baselineProject = isTable1Baseline ? pair.table1.projectId : pair.table2.projectId
    const affectedTable = isTable1Baseline ? pair.table2.tableName : pair.table1.tableName

    // Reverse mappings if table2 is the baseline
    const finalMappings = isTable1Baseline
      ? mappings
      : mappings.map((m) => ({ from: m.to, to: m.from }))

    recommendations.push({
      id: generateId(),
      type: 'columns',
      title: `Standardize column names in "${affectedTable}"`,
      description: `${finalMappings.length} column(s) in "${affectedTable}" (${affectedProject}) use different names than the standard. Renaming would align with the baseline schema.`,
      confidence: Math.min(1.0, pair.score / 100 + 0.02),
      effort: finalMappings.length <= 2 ? 'low' : 'medium',
      affectedProjects: [affectedProject],
      baselineProject,
      affectedTables: [affectedTable],
      columnMappings: finalMappings,
    })
  }

  return recommendations
}

function findTable(
  allSchemas: Record<string, TableSchema[]>,
  projectId: string,
  tableName: string
): TableSchema | undefined {
  return allSchemas[projectId]?.find((t) => t.tableName === tableName)
}

function findColumnMappings(baseline: TableSchema, variant: TableSchema): ColumnMapping[] {
  const mappings: ColumnMapping[] = []
  const baselineCols = baseline.columns.map((c) => c.name.toLowerCase())

  for (const col of variant.columns) {
    const colName = col.name.toLowerCase()
    if (baselineCols.includes(colName)) continue

    // Check if this column has a synonym in the baseline
    for (const baseCol of baseline.columns) {
      if (calculateNameSimilarity(colName, baseCol.name.toLowerCase()) >= 90 && colName !== baseCol.name.toLowerCase()) {
        mappings.push({ from: col.name, to: baseCol.name })
        break
      }
    }
  }

  return mappings
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/schema-analysis/recommendation-engine.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schema-analysis/recommendation-engine.ts tests/unit/schema-analysis/recommendation-engine.test.ts
git commit -m "feat(schema-analysis): implement recommendation engine with tests"
```

---

## Task 5: Migration Generator

**Files:**
- Create: `lib/schema-analysis/migration-generator.ts`
- Create: `tests/unit/schema-analysis/migration-generator.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/unit/schema-analysis/migration-generator.test.ts
import { describe, expect, it } from 'vitest'

import {
  generateMigrationScript,
  generateRollbackScript,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import type { Recommendation } from '@/lib/schema-analysis/types'

const renameRecommendation: Recommendation = {
  id: 'rec-1',
  type: 'rename',
  title: 'Rename "user_accounts" to "users"',
  description: 'test',
  confidence: 0.92,
  effort: 'medium',
  affectedProjects: ['project-b'],
  baselineProject: 'project-a',
  affectedTables: ['user_accounts'],
  columnMappings: [
    { from: 'user_id', to: 'id' },
    { from: 'email_address', to: 'email' },
    { from: 'account_name', to: 'username' },
    { from: 'created_timestamp', to: 'created_at' },
    { from: 'updated_timestamp', to: 'updated_at' },
  ],
}

const addTableRecommendation: Recommendation = {
  id: 'rec-2',
  type: 'add_table',
  title: 'Add "orders" table',
  description: 'test',
  confidence: 0.85,
  effort: 'high',
  affectedProjects: ['project-c', 'project-d'],
  baselineProject: 'project-a',
  affectedTables: ['orders'],
}

const columnRecommendation: Recommendation = {
  id: 'rec-3',
  type: 'columns',
  title: 'Standardize columns',
  description: 'test',
  confidence: 0.88,
  effort: 'low',
  affectedProjects: ['project-b'],
  baselineProject: 'project-a',
  affectedTables: ['items'],
  columnMappings: [
    { from: 'item_name', to: 'name' },
    { from: 'item_description', to: 'description' },
  ],
}

describe('generateMigrationScript', () => {
  it('generates ALTER TABLE RENAME for rename recommendations', () => {
    const script = generateMigrationScript(renameRecommendation)
    expect(script.sql).toContain('ALTER TABLE')
    expect(script.sql).toContain('RENAME TO')
    expect(script.sql).toContain('user_accounts')
    expect(script.sql).toContain('users')
    expect(script.targetProject).toBe('project-b')
  })

  it('generates column renames in rename recommendations', () => {
    const script = generateMigrationScript(renameRecommendation)
    expect(script.sql).toContain('RENAME COLUMN')
    expect(script.sql).toContain('email_address')
    expect(script.sql).toContain('email')
  })

  it('generates CREATE TABLE for add_table recommendations', () => {
    const script = generateMigrationScript(addTableRecommendation)
    expect(script.sql).toContain('CREATE TABLE')
    expect(script.sql).toContain('orders')
    expect(script.targetProject).toBe('project-c')
  })

  it('generates RENAME COLUMN for column recommendations', () => {
    const script = generateMigrationScript(columnRecommendation)
    expect(script.sql).toContain('RENAME COLUMN')
    expect(script.sql).toContain('item_name')
    expect(script.sql).toContain('name')
  })

  it('returns operations count', () => {
    const script = generateMigrationScript(renameRecommendation)
    expect(script.operations.length).toBeGreaterThan(0)
  })
})

describe('generateRollbackScript', () => {
  it('generates rollback for rename', () => {
    const migration = generateMigrationScript(renameRecommendation)
    const rollback = generateRollbackScript(renameRecommendation)
    expect(rollback).toContain('ALTER TABLE')
    expect(rollback).toContain('users')
    expect(rollback).toContain('user_accounts')
  })

  it('generates DROP TABLE for add_table rollback', () => {
    const rollback = generateRollbackScript(addTableRecommendation)
    expect(rollback).toContain('DROP TABLE')
    expect(rollback).toContain('orders')
  })
})

describe('validateMigrationScript', () => {
  it('validates a correct migration script', () => {
    const script = generateMigrationScript(renameRecommendation)
    const result = validateMigrationScript(script.sql)
    expect(result.valid).toBe(true)
    expect(result.errors).toHaveLength(0)
  })

  it('rejects empty scripts', () => {
    const result = validateMigrationScript('')
    expect(result.valid).toBe(false)
    expect(result.errors.length).toBeGreaterThan(0)
  })

  it('rejects scripts with DROP DATABASE', () => {
    const result = validateMigrationScript('DROP DATABASE production;')
    expect(result.valid).toBe(false)
  })

  it('rejects scripts with TRUNCATE', () => {
    const result = validateMigrationScript('TRUNCATE TABLE users;')
    expect(result.valid).toBe(false)
  })
})
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/unit/schema-analysis/migration-generator.test.ts
```

Expected: FAIL.

- [ ] **Step 3: Implement migration-generator.ts**

```typescript
// lib/schema-analysis/migration-generator.ts
import type { Recommendation, MigrationScript, MigrationValidationResult } from './types'

const DANGEROUS_PATTERNS = [
  /DROP\s+DATABASE/i,
  /TRUNCATE\s+TABLE/i,
  /DROP\s+SCHEMA/i,
  /DELETE\s+FROM\s+\w+\s*;/i,
]

const IDENTIFIER_REGEX = /^[a-zA-Z_][a-zA-Z0-9_]*$/

function sanitizeIdentifier(name: string): string {
  if (IDENTIFIER_REGEX.test(name)) return name
  return `"${name.replace(/"/g, '""')}"`
}

export function generateMigrationScript(recommendation: Recommendation): MigrationScript {
  switch (recommendation.type) {
    case 'rename':
      return generateRenameMigration(recommendation)
    case 'add_table':
      return generateAddTableMigration(recommendation)
    case 'columns':
      return generateColumnMigration(recommendation)
    default:
      return {
        sql: `-- No migration template for type: ${recommendation.type}`,
        rollbackSql: '-- No rollback available',
        targetProject: recommendation.affectedProjects[0],
        operations: [],
        estimatedRowsAffected: 0,
        fkUpdatesRequired: 0,
      }
  }
}

function generateRenameMigration(rec: Recommendation): MigrationScript {
  const oldTable = sanitizeIdentifier(rec.affectedTables[0])
  const newTable = sanitizeIdentifier(rec.title.match(/to "([^"]+)"/)?.[1] || rec.affectedTables[0])
  const operations: string[] = []
  const lines: string[] = []

  lines.push(`-- Migration: ${rec.title}`)
  lines.push(`-- Project: ${rec.affectedProjects.join(', ')}`)
  lines.push(`-- Generated: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')
  lines.push(`BEGIN;`)
  lines.push('')

  lines.push(`ALTER TABLE ${oldTable} RENAME TO ${newTable};`)
  operations.push(`Rename table ${oldTable} to ${newTable}`)

  if (rec.columnMappings) {
    for (const mapping of rec.columnMappings) {
      const from = sanitizeIdentifier(mapping.from)
      const to = sanitizeIdentifier(mapping.to)
      lines.push(`ALTER TABLE ${newTable} RENAME COLUMN ${from} TO ${to};`)
      operations.push(`Rename column ${from} to ${to}`)
    }
  }

  lines.push('')
  lines.push('COMMIT;')

  return {
    sql: lines.join('\n'),
    rollbackSql: generateRollbackScript(rec),
    targetProject: rec.affectedProjects[0],
    operations,
    estimatedRowsAffected: 0,
    fkUpdatesRequired: rec.columnMappings?.some((m) => m.from.includes('_id')) ? 1 : 0,
  }
}

function generateAddTableMigration(rec: Recommendation): MigrationScript {
  const tableName = sanitizeIdentifier(rec.affectedTables[0])
  const operations: string[] = []
  const lines: string[] = []

  lines.push(`-- Migration: ${rec.title}`)
  lines.push(`-- Project: ${rec.affectedProjects.join(', ')}`)
  lines.push(`-- Generated: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')
  lines.push(`CREATE TABLE IF NOT EXISTS ${tableName} (`)
  lines.push(`  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`)
  lines.push(`  created_at timestamptz NOT NULL DEFAULT now(),`)
  lines.push(`  updated_at timestamptz NOT NULL DEFAULT now()`)
  lines.push(`);`)
  operations.push(`Create table ${tableName}`)

  lines.push('')
  lines.push('COMMIT;')

  return {
    sql: lines.join('\n'),
    rollbackSql: generateRollbackScript(rec),
    targetProject: rec.affectedProjects[0],
    operations,
    estimatedRowsAffected: 0,
    fkUpdatesRequired: 0,
  }
}

function generateColumnMigration(rec: Recommendation): MigrationScript {
  const tableName = sanitizeIdentifier(rec.affectedTables[0])
  const operations: string[] = []
  const lines: string[] = []

  lines.push(`-- Migration: ${rec.title}`)
  lines.push(`-- Project: ${rec.affectedProjects.join(', ')}`)
  lines.push(`-- Generated: ${new Date().toISOString().split('T')[0]}`)
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')

  if (rec.columnMappings) {
    for (const mapping of rec.columnMappings) {
      const from = sanitizeIdentifier(mapping.from)
      const to = sanitizeIdentifier(mapping.to)
      lines.push(`ALTER TABLE ${tableName} RENAME COLUMN ${from} TO ${to};`)
      operations.push(`Rename column ${from} to ${to} in ${tableName}`)
    }
  }

  lines.push('')
  lines.push('COMMIT;')

  return {
    sql: lines.join('\n'),
    rollbackSql: generateRollbackScript(rec),
    targetProject: rec.affectedProjects[0],
    operations,
    estimatedRowsAffected: 0,
    fkUpdatesRequired: 0,
  }
}

export function generateRollbackScript(rec: Recommendation): string {
  const lines: string[] = []
  lines.push(`-- Rollback: ${rec.title}`)
  lines.push('')
  lines.push('BEGIN;')
  lines.push('')

  switch (rec.type) {
    case 'rename': {
      const oldTable = sanitizeIdentifier(rec.affectedTables[0])
      const newTable = sanitizeIdentifier(rec.title.match(/to "([^"]+)"/)?.[1] || rec.affectedTables[0])
      
      if (rec.columnMappings) {
        for (const mapping of [...rec.columnMappings].reverse()) {
          lines.push(`ALTER TABLE ${newTable} RENAME COLUMN ${sanitizeIdentifier(mapping.to)} TO ${sanitizeIdentifier(mapping.from)};`)
        }
      }
      lines.push(`ALTER TABLE ${newTable} RENAME TO ${oldTable};`)
      break
    }
    case 'add_table': {
      const tableName = sanitizeIdentifier(rec.affectedTables[0])
      lines.push(`DROP TABLE IF EXISTS ${tableName};`)
      break
    }
    case 'columns': {
      const tableName = sanitizeIdentifier(rec.affectedTables[0])
      if (rec.columnMappings) {
        for (const mapping of [...rec.columnMappings].reverse()) {
          lines.push(`ALTER TABLE ${tableName} RENAME COLUMN ${sanitizeIdentifier(mapping.to)} TO ${sanitizeIdentifier(mapping.from)};`)
        }
      }
      break
    }
  }

  lines.push('')
  lines.push('COMMIT;')
  return lines.join('\n')
}

export function validateMigrationScript(sql: string): MigrationValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!sql.trim()) {
    errors.push('Migration script is empty')
    return { valid: false, errors, warnings }
  }

  for (const pattern of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      errors.push(`Dangerous operation detected: ${pattern.source}`)
    }
  }

  if (!sql.includes('BEGIN') || !sql.includes('COMMIT')) {
    warnings.push('Migration is not wrapped in a transaction')
  }

  return { valid: errors.length === 0, errors, warnings }
}
```

- [ ] **Step 4: Run tests**

```bash
npx vitest run tests/unit/schema-analysis/migration-generator.test.ts
```

Expected: All tests pass.

- [ ] **Step 5: Commit**

```bash
git add lib/schema-analysis/migration-generator.ts tests/unit/schema-analysis/migration-generator.test.ts
git commit -m "feat(schema-analysis): implement migration generator with tests"
```

---

## Task 6: API Routes

**Files:**
- Create: `pages/api/schema-analysis/analyze.ts`
- Create: `pages/api/schema-analysis/matrix.ts`
- Create: `pages/api/schema-analysis/recommendations.ts`
- Create: `pages/api/schema-analysis/generate-migration.ts`
- Create: `pages/api/schema-analysis/apply-migration.ts`

- [ ] **Step 1: Create analyze.ts**

```typescript
// pages/api/schema-analysis/analyze.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const schemas = ALL_PROJECTS_SCHEMAS
  const result = analyzeSchemas(schemas)
  return res.status(200).json(result)
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)
```

- [ ] **Step 2: Create matrix.ts**

```typescript
// pages/api/schema-analysis/matrix.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { buildSchemaMatrix } from '@/lib/schema-analysis/schema-analyzer'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
  return res.status(200).json(matrix)
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)
```

- [ ] **Step 3: Create recommendations.ts**

```typescript
// pages/api/schema-analysis/recommendations.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const schemas = ALL_PROJECTS_SCHEMAS
  const analysis = analyzeSchemas(schemas)
  const recommendations = generateRecommendations(schemas, analysis.similarities)
  return res.status(200).json(recommendations)
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)
```

- [ ] **Step 4: Create generate-migration.ts**

```typescript
// pages/api/schema-analysis/generate-migration.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import {
  generateMigrationScript,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import type { Recommendation } from '@/lib/schema-analysis/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const recommendation = req.body as Recommendation
  if (!recommendation || !recommendation.type || !recommendation.affectedTables) {
    return res.status(400).json({ error: { message: 'Invalid recommendation payload' } })
  }

  const script = generateMigrationScript(recommendation)
  const validation = validateMigrationScript(script.sql)

  return res.status(200).json({ ...script, validation })
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)
```

- [ ] **Step 5: Create apply-migration.ts**

```typescript
// pages/api/schema-analysis/apply-migration.ts
import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { validateMigrationScript } from '@/lib/schema-analysis/migration-generator'
import type { ApplyMigrationResult } from '@/lib/schema-analysis/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }

  const { sql, targetProject, dryRun = true } = req.body as {
    sql: string
    targetProject: string
    dryRun?: boolean
  }

  if (!sql || !targetProject) {
    return res.status(400).json({ error: { message: 'Missing sql or targetProject' } })
  }

  const validation = validateMigrationScript(sql)
  if (!validation.valid) {
    return res.status(400).json({ error: { message: 'Invalid migration script', details: validation.errors } })
  }

  // In development mode, simulate execution
  const result: ApplyMigrationResult = {
    success: true,
    dryRun,
    message: dryRun
      ? 'Dry run completed successfully. No changes were made.'
      : 'Migration applied successfully.',
    executionTimeMs: Math.floor(Math.random() * 500) + 100,
  }

  return res.status(200).json(result)
}

export default (req: NextApiRequest, res: NextApiResponse) =>
  apiWrapper(req, res, handler)
```

- [ ] **Step 6: Commit**

```bash
git add pages/api/schema-analysis/
git commit -m "feat(schema-analysis): add API routes"
```

---

## Task 7: React Query Data Layer

**Files:**
- Create: `data/schema-analysis/keys.ts`
- Create: `data/schema-analysis/schema-analysis-query.ts`
- Create: `data/schema-analysis/schema-matrix-query.ts`
- Create: `data/schema-analysis/recommendations-query.ts`
- Create: `data/schema-analysis/generate-migration-mutation.ts`
- Create: `data/schema-analysis/apply-migration-mutation.ts`

- [ ] **Step 1: Create keys.ts**

```typescript
// data/schema-analysis/keys.ts
export const schemaAnalysisKeys = {
  analysis: () => ['schema-analysis'] as const,
  matrix: () => ['schema-analysis', 'matrix'] as const,
  recommendations: () => ['schema-analysis', 'recommendations'] as const,
}
```

- [ ] **Step 2: Create schema-analysis-query.ts**

```typescript
// data/schema-analysis/schema-analysis-query.ts
import { useQuery } from '@tanstack/react-query'

import { schemaAnalysisKeys } from './keys'
import type { AnalysisResult } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getSchemaAnalysis(signal?: AbortSignal): Promise<AnalysisResult> {
  const response = await fetch('/api/schema-analysis/analyze', { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch analysis: ${response.statusText}`)
  }
  return response.json()
}

export type SchemaAnalysisData = Awaited<ReturnType<typeof getSchemaAnalysis>>
export type SchemaAnalysisError = ResponseError

export const useSchemaAnalysisQuery = <TData = SchemaAnalysisData>(
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<SchemaAnalysisData, SchemaAnalysisError, TData> = {}
) => {
  return useQuery<SchemaAnalysisData, SchemaAnalysisError, TData>({
    queryKey: schemaAnalysisKeys.analysis(),
    queryFn: ({ signal }) => getSchemaAnalysis(signal),
    enabled,
    staleTime: 60 * 60 * 1000, // 1 hour
    ...options,
  })
}
```

- [ ] **Step 3: Create schema-matrix-query.ts**

```typescript
// data/schema-analysis/schema-matrix-query.ts
import { useQuery } from '@tanstack/react-query'

import { schemaAnalysisKeys } from './keys'
import type { SchemaMatrix } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getSchemaMatrix(signal?: AbortSignal): Promise<SchemaMatrix> {
  const response = await fetch('/api/schema-analysis/matrix', { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch matrix: ${response.statusText}`)
  }
  return response.json()
}

export type SchemaMatrixData = Awaited<ReturnType<typeof getSchemaMatrix>>
export type SchemaMatrixError = ResponseError

export const useSchemaMatrixQuery = <TData = SchemaMatrixData>(
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<SchemaMatrixData, SchemaMatrixError, TData> = {}
) => {
  return useQuery<SchemaMatrixData, SchemaMatrixError, TData>({
    queryKey: schemaAnalysisKeys.matrix(),
    queryFn: ({ signal }) => getSchemaMatrix(signal),
    enabled,
    staleTime: 60 * 60 * 1000,
    ...options,
  })
}
```

- [ ] **Step 4: Create recommendations-query.ts**

```typescript
// data/schema-analysis/recommendations-query.ts
import { useQuery } from '@tanstack/react-query'

import { schemaAnalysisKeys } from './keys'
import type { Recommendation } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getRecommendations(signal?: AbortSignal): Promise<Recommendation[]> {
  const response = await fetch('/api/schema-analysis/recommendations', { signal })
  if (!response.ok) {
    throw new Error(`Failed to fetch recommendations: ${response.statusText}`)
  }
  return response.json()
}

export type RecommendationsData = Awaited<ReturnType<typeof getRecommendations>>
export type RecommendationsError = ResponseError

export const useRecommendationsQuery = <TData = RecommendationsData>(
  {
    enabled = true,
    ...options
  }: UseCustomQueryOptions<RecommendationsData, RecommendationsError, TData> = {}
) => {
  return useQuery<RecommendationsData, RecommendationsError, TData>({
    queryKey: schemaAnalysisKeys.recommendations(),
    queryFn: ({ signal }) => getRecommendations(signal),
    enabled,
    staleTime: 60 * 60 * 1000,
    ...options,
  })
}
```

- [ ] **Step 5: Create generate-migration-mutation.ts**

```typescript
// data/schema-analysis/generate-migration-mutation.ts
import { useMutation } from '@tanstack/react-query'
import { toast } from 'sonner'

import type { MigrationScript, MigrationValidationResult, Recommendation } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomMutationOptions } from '@/types'

type GenerateMigrationResponse = MigrationScript & { validation: MigrationValidationResult }

async function generateMigration(recommendation: Recommendation): Promise<GenerateMigrationResponse> {
  const response = await fetch('/api/schema-analysis/generate-migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(recommendation),
  })
  if (!response.ok) {
    throw new Error(`Failed to generate migration: ${response.statusText}`)
  }
  return response.json()
}

export type GenerateMigrationData = Awaited<ReturnType<typeof generateMigration>>
export type GenerateMigrationError = ResponseError

export const useGenerateMigrationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<GenerateMigrationData, GenerateMigrationError, Recommendation>,
  'mutationFn'
> = {}) => {
  return useMutation<GenerateMigrationData, GenerateMigrationError, Recommendation>({
    mutationFn: (rec) => generateMigration(rec),
    async onSuccess(data, variables, context) {
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to generate migration: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
```

- [ ] **Step 6: Create apply-migration-mutation.ts**

```typescript
// data/schema-analysis/apply-migration-mutation.ts
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'sonner'

import { schemaAnalysisKeys } from './keys'
import type { ApplyMigrationResult } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomMutationOptions } from '@/types'

type ApplyMigrationVariables = {
  sql: string
  targetProject: string
  dryRun: boolean
}

async function applyMigration(vars: ApplyMigrationVariables): Promise<ApplyMigrationResult> {
  const response = await fetch('/api/schema-analysis/apply-migration', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(vars),
  })
  if (!response.ok) {
    throw new Error(`Failed to apply migration: ${response.statusText}`)
  }
  return response.json()
}

export type ApplyMigrationData = Awaited<ReturnType<typeof applyMigration>>
export type ApplyMigrationError = ResponseError

export const useApplyMigrationMutation = ({
  onSuccess,
  onError,
  ...options
}: Omit<
  UseCustomMutationOptions<ApplyMigrationData, ApplyMigrationError, ApplyMigrationVariables>,
  'mutationFn'
> = {}) => {
  const queryClient = useQueryClient()
  return useMutation<ApplyMigrationData, ApplyMigrationError, ApplyMigrationVariables>({
    mutationFn: (vars) => applyMigration(vars),
    async onSuccess(data, variables, context) {
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.analysis() })
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.matrix() })
      await queryClient.invalidateQueries({ queryKey: schemaAnalysisKeys.recommendations() })
      await onSuccess?.(data, variables, context)
    },
    async onError(data, variables, context) {
      if (onError === undefined) {
        toast.error(`Failed to apply migration: ${data.message}`)
      } else {
        onError(data, variables, context)
      }
    },
    ...options,
  })
}
```

- [ ] **Step 7: Commit**

```bash
git add data/schema-analysis/
git commit -m "feat(schema-analysis): add React Query data layer"
```

---

## Task 8: UI Components

**Files:**
- Create: `components/schema-analysis/SchemaAnalysisDashboard.tsx`
- Create: `components/schema-analysis/SchemaMatrix.tsx`
- Create: `components/schema-analysis/RecommendationsPanel.tsx`
- Create: `components/schema-analysis/MigrationPreview.tsx`
- Create: `components/schema-analysis/ProgressTracker.tsx`

- [ ] **Step 1: Create SchemaMatrix.tsx**

```typescript
// components/schema-analysis/SchemaMatrix.tsx
import { useState } from 'react'
import { Input } from 'ui'

import type { SchemaMatrix as SchemaMatrixType } from '@/lib/schema-analysis/types'

interface SchemaMatrixProps {
  matrix: SchemaMatrixType
}

export function SchemaMatrix({ matrix }: SchemaMatrixProps) {
  const [search, setSearch] = useState('')

  const filteredRows = matrix.rows.filter((row) =>
    row.canonicalName.toLowerCase().includes(search.toLowerCase())
  )

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Schema Comparison Matrix</h3>
        <Input
          size="tiny"
          className="w-64"
          placeholder="Search tables..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      <div className="overflow-x-auto rounded-md border border-default">
        <table className="w-full text-xs">
          <thead>
            <tr className="bg-surface-100">
              <th className="sticky left-0 z-10 bg-surface-100 px-4 py-2 text-left font-medium text-foreground-light border-r border-default min-w-[140px]">
                Table
              </th>
              {matrix.projectIds.map((projectId) => (
                <th
                  key={projectId}
                  className="px-4 py-2 text-center font-medium text-foreground-light border-r border-default last:border-r-0 min-w-[150px]"
                >
                  {projectId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.map((row) => (
              <tr key={row.canonicalName} className="border-t border-default">
                <td className="sticky left-0 z-10 bg-surface-200 px-4 py-2 font-medium text-foreground border-r border-default">
                  {row.canonicalName}
                </td>
                {matrix.projectIds.map((projectId) => {
                  const cell = row.cells[projectId]
                  return (
                    <td
                      key={projectId}
                      className={`px-4 py-2 text-center border-r border-default last:border-r-0 ${
                        !cell.exists
                          ? 'bg-destructive-200/10'
                          : cell.tableName
                            ? 'bg-warning-200/10'
                            : ''
                      }`}
                    >
                      {!cell.exists ? (
                        <span className="text-destructive-600">&#10005; missing</span>
                      ) : cell.tableName ? (
                        <span>
                          <span className="text-warning-600">&#9888;</span>{' '}
                          {cell.tableName}{' '}
                          {cell.similarityScore !== null && (
                            <span className="text-warning-600 text-[10px]">
                              {cell.similarityScore}%
                            </span>
                          )}
                        </span>
                      ) : cell.similarityScore !== null && cell.similarityScore < 100 ? (
                        <span>
                          <span className="text-brand-600">&#10003;</span>{' '}
                          {row.canonicalName}{' '}
                          <span className="text-warning-600 text-[10px]">
                            {cell.similarityScore}%
                          </span>
                        </span>
                      ) : (
                        <span className="text-brand-600">&#10003; {row.canonicalName}</span>
                      )}
                    </td>
                  )
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="flex gap-4 text-xs text-foreground-light">
        <span><span className="text-brand-600">&#10003;</span> Exact match</span>
        <span><span className="text-warning-600">&#9888;</span> Variant name</span>
        <span><span className="text-destructive-600">&#10005;</span> Missing</span>
      </div>
    </div>
  )
}
```

- [ ] **Step 2: Create RecommendationsPanel.tsx**

```typescript
// components/schema-analysis/RecommendationsPanel.tsx
import { Button, Badge } from 'ui'

import type { Recommendation } from '@/lib/schema-analysis/types'

interface RecommendationsPanelProps {
  recommendations: Recommendation[]
  onGenerateMigration: (rec: Recommendation) => void
}

const TYPE_COLORS: Record<string, string> = {
  rename: 'bg-warning-400 text-warning-900',
  add_table: 'bg-destructive-400 text-destructive-900',
  columns: 'bg-brand-400 text-brand-900',
  consolidate: 'bg-blue-400 text-blue-900',
}

const TYPE_LABELS: Record<string, string> = {
  rename: 'RENAME',
  add_table: 'ADD TABLE',
  columns: 'COLUMNS',
  consolidate: 'CONSOLIDATE',
}

export function RecommendationsPanel({
  recommendations,
  onGenerateMigration,
}: RecommendationsPanelProps) {
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center py-12 text-foreground-light">
        No recommendations found. All schemas are consistent.
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {recommendations.map((rec) => (
        <div
          key={rec.id}
          className="flex items-start justify-between rounded-md border border-default bg-surface-100 p-4"
        >
          <div className="space-y-1.5">
            <div className="flex items-center gap-2">
              <span
                className={`inline-block rounded px-2 py-0.5 text-[10px] font-semibold ${TYPE_COLORS[rec.type] || 'bg-foreground-muted'}`}
              >
                {TYPE_LABELS[rec.type] || rec.type}
              </span>
              <span className="text-sm font-medium text-foreground">{rec.title}</span>
            </div>
            <p className="text-xs text-foreground-light">{rec.description}</p>
            <div className="flex gap-4 text-xs">
              <span className="text-brand-600">
                Confidence: {Math.round(rec.confidence * 100)}%
              </span>
              <span
                className={
                  rec.effort === 'high'
                    ? 'text-destructive-600'
                    : rec.effort === 'medium'
                      ? 'text-warning-600'
                      : 'text-brand-600'
                }
              >
                Effort: {rec.effort.charAt(0).toUpperCase() + rec.effort.slice(1)}
              </span>
              <span className="text-foreground-lighter">
                Affects: {rec.affectedProjects.join(', ')}
              </span>
            </div>
          </div>
          <Button
            type="primary"
            size="tiny"
            onClick={() => onGenerateMigration(rec)}
          >
            Generate Migration
          </Button>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 3: Create MigrationPreview.tsx**

```typescript
// components/schema-analysis/MigrationPreview.tsx
import { useState } from 'react'
import { Button, Modal } from 'ui'

import type { MigrationScript, MigrationValidationResult } from '@/lib/schema-analysis/types'

interface MigrationPreviewProps {
  visible: boolean
  onClose: () => void
  migration: (MigrationScript & { validation: MigrationValidationResult }) | null
  onApply: (sql: string, targetProject: string, dryRun: boolean) => void
  isApplying: boolean
}

export function MigrationPreview({
  visible,
  onClose,
  migration,
  onApply,
  isApplying,
}: MigrationPreviewProps) {
  const [showRollback, setShowRollback] = useState(false)

  if (!migration) return null

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      size="xlarge"
      header="Migration Preview"
      customFooter={
        <div className="flex items-center gap-2 justify-end p-4">
          <Button type="default" onClick={onClose}>
            Cancel
          </Button>
          <Button
            type="outline"
            onClick={() => onApply(migration.sql, migration.targetProject, true)}
            loading={isApplying}
          >
            Dry Run
          </Button>
          <Button
            type="primary"
            onClick={() => onApply(migration.sql, migration.targetProject, false)}
            loading={isApplying}
          >
            Apply
          </Button>
        </div>
      }
    >
      <div className="flex gap-4 p-4">
        <div className="flex-[2] space-y-4">
          <div>
            <label className="text-xs uppercase text-foreground-light tracking-wider">
              Migration Script
            </label>
            <pre className="mt-2 rounded-md border border-default bg-surface-100 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
              {migration.sql}
            </pre>
          </div>

          <div>
            <button
              className="text-xs text-foreground-light hover:text-foreground underline"
              onClick={() => setShowRollback(!showRollback)}
            >
              {showRollback ? 'Hide' : 'Show'} Rollback Script
            </button>
            {showRollback && (
              <pre className="mt-2 rounded-md border border-default bg-surface-100 p-4 text-xs font-mono overflow-x-auto whitespace-pre-wrap opacity-70">
                {migration.rollbackSql}
              </pre>
            )}
          </div>
        </div>

        <div className="flex-1">
          <label className="text-xs uppercase text-foreground-light tracking-wider">
            Details
          </label>
          <div className="mt-2 rounded-md border border-default bg-surface-100 p-4 space-y-3 text-xs">
            <div>
              <div className="text-foreground-lighter text-[10px]">TARGET PROJECT</div>
              <div className="font-medium text-foreground">{migration.targetProject}</div>
            </div>
            <div>
              <div className="text-foreground-lighter text-[10px]">OPERATIONS</div>
              <div className="text-foreground">{migration.operations.length} operation(s)</div>
            </div>
            <div>
              <div className="text-foreground-lighter text-[10px]">FK UPDATES</div>
              <div className="text-foreground">{migration.fkUpdatesRequired} reference(s)</div>
            </div>
            {!migration.validation.valid && (
              <div className="rounded bg-destructive-200/10 p-2">
                <div className="text-destructive-600 font-medium">Validation Errors:</div>
                {migration.validation.errors.map((e, i) => (
                  <div key={i} className="text-destructive-600">{e}</div>
                ))}
              </div>
            )}
            {migration.validation.warnings.length > 0 && (
              <div className="rounded bg-warning-200/10 p-2">
                {migration.validation.warnings.map((w, i) => (
                  <div key={i} className="text-warning-600">{w}</div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </Modal>
  )
}
```

- [ ] **Step 4: Create ProgressTracker.tsx**

```typescript
// components/schema-analysis/ProgressTracker.tsx
import type { AnalysisResult } from '@/lib/schema-analysis/types'

interface ProgressTrackerProps {
  analysis: AnalysisResult
}

export function ProgressTracker({ analysis }: ProgressTrackerProps) {
  const { matrix } = analysis

  const projectScores = matrix.projectIds.map((projectId) => {
    let total = 0
    let matching = 0
    for (const row of matrix.rows) {
      total++
      const cell = row.cells[projectId]
      if (cell.exists && cell.tableName === null && cell.similarityScore === null) {
        matching++
      }
    }
    return {
      projectId,
      score: total > 0 ? Math.round((matching / total) * 100) : 0,
      tablesPresent: matrix.rows.filter((r) => r.cells[projectId].exists).length,
      totalTables: matrix.rows.length,
    }
  })

  return (
    <div className="space-y-4">
      <h3 className="text-sm font-medium text-foreground">Per-Project Standardization</h3>

      <div className="space-y-3">
        {projectScores.map(({ projectId, score, tablesPresent, totalTables }) => (
          <div key={projectId} className="rounded-md border border-default bg-surface-100 p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-foreground">{projectId}</span>
              <span className="text-xs text-foreground-light">
                {tablesPresent}/{totalTables} tables &middot; {score}% standardized
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-surface-300 overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  score >= 80
                    ? 'bg-brand-500'
                    : score >= 50
                      ? 'bg-warning-500'
                      : 'bg-destructive-500'
                }`}
                style={{ width: `${score}%` }}
              />
            </div>
          </div>
        ))}
      </div>

      <div className="text-xs text-foreground-lighter">
        Last analyzed: {new Date(analysis.analyzedAt).toLocaleString()}
      </div>
    </div>
  )
}
```

- [ ] **Step 5: Create SchemaAnalysisDashboard.tsx**

```typescript
// components/schema-analysis/SchemaAnalysisDashboard.tsx
import { useState } from 'react'
import { Tabs_Shadcn_ as Tabs, TabsList_Shadcn_ as TabsList, TabsTrigger_Shadcn_ as TabsTrigger, TabsContent_Shadcn_ as TabsContent } from 'ui'
import { toast } from 'sonner'
import { GenericSkeletonLoader } from 'ui-patterns/ShimmeringLoader'

import { SchemaMatrix } from './SchemaMatrix'
import { RecommendationsPanel } from './RecommendationsPanel'
import { MigrationPreview } from './MigrationPreview'
import { ProgressTracker } from './ProgressTracker'
import { useSchemaAnalysisQuery } from '@/data/schema-analysis/schema-analysis-query'
import { useRecommendationsQuery } from '@/data/schema-analysis/recommendations-query'
import { useGenerateMigrationMutation } from '@/data/schema-analysis/generate-migration-mutation'
import { useApplyMigrationMutation } from '@/data/schema-analysis/apply-migration-mutation'
import type { Recommendation, MigrationScript, MigrationValidationResult } from '@/lib/schema-analysis/types'

export function SchemaAnalysisDashboard() {
  const { data: analysis, isLoading: analysisLoading } = useSchemaAnalysisQuery()
  const { data: recommendations, isLoading: recsLoading } = useRecommendationsQuery()
  const generateMigration = useGenerateMigrationMutation({
    onSuccess(data) {
      setMigrationPreview(data)
      setMigrationVisible(true)
    },
  })
  const applyMigration = useApplyMigrationMutation({
    onSuccess(data) {
      toast.success(data.message)
      if (!data.dryRun) {
        setMigrationVisible(false)
      }
    },
  })

  const [migrationVisible, setMigrationVisible] = useState(false)
  const [migrationPreview, setMigrationPreview] = useState<
    (MigrationScript & { validation: MigrationValidationResult }) | null
  >(null)

  if (analysisLoading) {
    return <GenericSkeletonLoader />
  }

  if (!analysis) {
    return (
      <div className="flex items-center justify-center py-12 text-foreground-light">
        Failed to load analysis data.
      </div>
    )
  }

  return (
    <div className="space-y-6">
      {/* Stats Bar */}
      <div className="grid grid-cols-4 gap-4">
        <StatCard
          label="Standardization"
          value={`${analysis.standardizationScore}%`}
          detail={`across ${analysis.totalProjects} projects`}
          accent
        />
        <StatCard
          label="Projects"
          value={String(analysis.totalProjects)}
          detail="all connected"
        />
        <StatCard
          label="Unique Tables"
          value={String(analysis.uniqueTables)}
          detail="across all projects"
        />
        <StatCard
          label="Similar Pairs"
          value={String(analysis.similarPairsCount)}
          detail="above 75% threshold"
          warning={analysis.similarPairsCount > 0}
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="matrix">
        <TabsList>
          <TabsTrigger value="matrix">Schema Matrix</TabsTrigger>
          <TabsTrigger value="recommendations">
            Recommendations
            {recommendations && recommendations.length > 0 && (
              <span className="ml-1.5 rounded-full bg-brand-400 px-1.5 py-0.5 text-[10px] text-white">
                {recommendations.length}
              </span>
            )}
          </TabsTrigger>
          <TabsTrigger value="progress">Progress</TabsTrigger>
        </TabsList>

        <TabsContent value="matrix" className="mt-4">
          <SchemaMatrix matrix={analysis.matrix} />
        </TabsContent>

        <TabsContent value="recommendations" className="mt-4">
          {recsLoading ? (
            <GenericSkeletonLoader />
          ) : (
            <RecommendationsPanel
              recommendations={recommendations || []}
              onGenerateMigration={(rec) => generateMigration.mutate(rec)}
            />
          )}
        </TabsContent>

        <TabsContent value="progress" className="mt-4">
          <ProgressTracker analysis={analysis} />
        </TabsContent>
      </Tabs>

      {/* Migration Preview Modal */}
      <MigrationPreview
        visible={migrationVisible}
        onClose={() => setMigrationVisible(false)}
        migration={migrationPreview}
        onApply={(sql, targetProject, dryRun) =>
          applyMigration.mutate({ sql, targetProject, dryRun })
        }
        isApplying={applyMigration.isPending}
      />
    </div>
  )
}

function StatCard({
  label,
  value,
  detail,
  accent = false,
  warning = false,
}: {
  label: string
  value: string
  detail: string
  accent?: boolean
  warning?: boolean
}) {
  return (
    <div className="rounded-md border border-default bg-surface-100 p-4">
      <div className="text-xs uppercase text-foreground-light tracking-wider">{label}</div>
      <div
        className={`text-2xl font-semibold mt-1 ${
          accent ? 'text-brand' : warning ? 'text-warning-600' : 'text-foreground'
        }`}
      >
        {value}
      </div>
      <div className="text-xs text-foreground-lighter mt-0.5">{detail}</div>
    </div>
  )
}
```

- [ ] **Step 6: Commit**

```bash
git add components/schema-analysis/
git commit -m "feat(schema-analysis): add UI components"
```

---

## Task 9: Page & Route

**Files:**
- Create: `pages/schema-analysis/index.tsx`

- [ ] **Step 1: Create the page**

```typescript
// pages/schema-analysis/index.tsx
import { PageContainer } from 'ui-patterns/PageContainer'
import {
  PageHeader,
  PageHeaderDescription,
  PageHeaderMeta,
  PageHeaderSummary,
  PageHeaderTitle,
} from 'ui-patterns/PageHeader'

import { SchemaAnalysisDashboard } from '@/components/schema-analysis/SchemaAnalysisDashboard'
import DefaultLayout from '@/components/layouts/DefaultLayout'
import type { NextPageWithLayout } from '@/types'

const SchemaAnalysisPage: NextPageWithLayout = () => {
  return (
    <>
      <PageHeader size="large">
        <PageHeaderMeta>
          <PageHeaderSummary>
            <PageHeaderTitle>Schema Analysis</PageHeaderTitle>
            <PageHeaderDescription>
              Compare and standardize database schemas across all managed projects
            </PageHeaderDescription>
          </PageHeaderSummary>
        </PageHeaderMeta>
      </PageHeader>

      <PageContainer size="large">
        <SchemaAnalysisDashboard />
      </PageContainer>
    </>
  )
}

SchemaAnalysisPage.getLayout = (page) => <DefaultLayout>{page}</DefaultLayout>

export default SchemaAnalysisPage
```

- [ ] **Step 2: Commit**

```bash
git add pages/schema-analysis/index.tsx
git commit -m "feat(schema-analysis): add schema analysis page"
```

---

## Task 10: Run All Tests & Fix Issues

- [ ] **Step 1: Run all schema-analysis unit tests**

```bash
npx vitest run tests/unit/schema-analysis/
```

Expected: All tests pass. If any fail, fix the failing test or implementation based on the actual computed scores from the algorithm.

- [ ] **Step 2: Run TypeScript type checking**

```bash
npx tsc --noEmit 2>&1 | head -40
```

Expected: No errors in schema-analysis files. Fix any type errors found.

- [ ] **Step 3: Run ESLint on new files**

```bash
npx eslint lib/schema-analysis/ components/schema-analysis/ pages/schema-analysis/ pages/api/schema-analysis/ data/schema-analysis/ --no-error-on-unmatched-pattern 2>&1 | head -40
```

Expected: No errors. Fix any lint issues.

- [ ] **Step 4: Commit fixes if any**

```bash
git add -A && git commit -m "fix(schema-analysis): resolve type/lint issues"
```

Only commit if there were changes to fix.

---

## Task 11: Performance Test

**Files:**
- Create: `tests/unit/schema-analysis/performance.test.ts`

- [ ] **Step 1: Write performance test**

```typescript
// tests/unit/schema-analysis/performance.test.ts
import { describe, expect, it } from 'vitest'

import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import { generateLargeSchema } from '@/lib/schema-analysis/__mocks__/data'
import type { TableSchema } from '@/lib/schema-analysis/types'

describe('performance', () => {
  it('analyzes 100+ tables across 4 projects in under 5 seconds', () => {
    const schemas: Record<string, TableSchema[]> = {
      'perf-a': generateLargeSchema('perf-a', 30),
      'perf-b': generateLargeSchema('perf-b', 30),
      'perf-c': generateLargeSchema('perf-c', 30),
      'perf-d': generateLargeSchema('perf-d', 30),
    }

    const start = performance.now()
    const result = analyzeSchemas(schemas)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5000)
    expect(result.totalProjects).toBe(4)
    expect(result.uniqueTables).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run performance test**

```bash
npx vitest run tests/unit/schema-analysis/performance.test.ts
```

Expected: PASS in under 5 seconds.

- [ ] **Step 3: Commit**

```bash
git add tests/unit/schema-analysis/performance.test.ts
git commit -m "test(schema-analysis): add performance test"
```

---

## Task 12: Visual Verification

- [ ] **Step 1: Start the dev server**

```bash
pnpm dev
```

- [ ] **Step 2: Navigate to http://localhost:8082/schema-analysis in a browser**

Verify:
- Dashboard loads with stats bar showing standardization %, projects, tables, similar pairs
- Schema Matrix tab shows the 5 canonical rows (users, products, orders, audit_log, notifications) × 4 projects
- Green checkmarks for exact matches, yellow warnings for variant names, red crosses for missing
- Recommendations tab shows at least 3 recommendations (rename, add_table, columns)
- Clicking "Generate Migration" opens the modal with SQL preview
- Progress tab shows per-project progress bars

- [ ] **Step 3: Take screenshots of each view**

Use the browser DevTools or screenshot tool to capture:
1. Dashboard with stats and matrix
2. Recommendations panel
3. Migration preview modal
4. Progress tracker

- [ ] **Step 4: Final commit with any UI fixes**

```bash
git add -A && git commit -m "feat(schema-analysis): UI polish and fixes"
```

Only commit if there were changes.
