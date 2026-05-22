/**
 * Schema Similarity Algorithm
 *
 * Computes a composite 0–100 similarity score between two `TableSchema`s
 * by combining three weighted dimensions:
 *
 *   totalScore = name * 0.3 + structure * 0.5 + semantic * 0.2
 *
 * The algorithm is deterministic and pure — given the same inputs it will
 * always produce the same outputs.
 */

import type {
  ColumnDefinition,
  SimilarityBreakdown,
  SimilarityClassification,
  TableSchema,
} from '@/lib/schema-analysis/types'

// ---------------------------------------------------------------------------
// Synonym maps
// ---------------------------------------------------------------------------

/**
 * Table-level synonyms. Symmetric: if `a` is in `TABLE_SYNONYMS[b]`,
 * then `b` will also be considered a synonym of `a` thanks to {@link areSynonyms}.
 */
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

/**
 * Column-level synonyms. Same symmetry guarantee as {@link TABLE_SYNONYMS}.
 */
const COLUMN_SYNONYMS: Record<string, string[]> = {
  email: ['email_address'],
  email_address: ['email'],
  created_at: ['created_timestamp', 'createdat'],
  created_timestamp: ['created_at', 'createdat'],
  updated_at: ['updated_timestamp', 'updatedat'],
  updated_timestamp: ['updated_at', 'updatedat'],
  username: ['account_name', 'user_name'],
  account_name: ['username', 'user_name'],
  name: ['item_name', 'product_name'],
  item_name: ['name', 'product_name'],
  product_name: ['name', 'item_name'],
  price: ['item_price', 'product_price'],
  item_price: ['price', 'product_price'],
  product_price: ['price', 'item_price'],
  status: ['transaction_status', 'order_status'],
  transaction_status: ['status', 'order_status'],
  order_status: ['status', 'transaction_status'],
  id: ['user_id', 'item_id', 'transaction_id', 'product_id', 'order_id', 'account_id'],
  user_id: ['account_id', 'id'],
  account_id: ['user_id', 'id'],
  item_id: ['id', 'product_id'],
  product_id: ['id', 'item_id'],
  transaction_id: ['id', 'order_id'],
  order_id: ['id', 'transaction_id'],
  total_amount: ['amount'],
  amount: ['total_amount'],
  description: ['item_description', 'product_description'],
  item_description: ['description', 'product_description'],
  product_description: ['description', 'item_description'],
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Lowercase + strip underscores/hyphens. */
function normalize(name: string): string {
  return name.toLowerCase().replace(/[_-]/g, '')
}

/** Lookup canonical key for synonym maps (lowercased, underscores preserved). */
function canonical(name: string): string {
  return name.toLowerCase().trim()
}

function areSynonyms(a: string, b: string, map: Record<string, string[]>): boolean {
  const ca = canonical(a)
  const cb = canonical(b)
  if (ca === cb) return true
  if (map[ca]?.includes(cb)) return true
  if (map[cb]?.includes(ca)) return true
  return false
}

/** Classic Levenshtein distance (iterative, O(m*n) time, O(min(m,n)) space). */
function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  // Ensure `b` is the shorter string for memory efficiency.
  if (a.length < b.length) {
    ;[a, b] = [b, a]
  }

  let prev = new Array<number>(b.length + 1)
  let curr = new Array<number>(b.length + 1)

  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(
        prev[j] + 1, // deletion
        curr[j - 1] + 1, // insertion
        prev[j - 1] + cost // substitution
      )
    }
    ;[prev, curr] = [curr, prev]
  }

  return prev[b.length]
}

/** Convert Levenshtein distance to a 0–100 similarity. */
function levenshteinSimilarity(a: string, b: string): number {
  if (a.length === 0 && b.length === 0) return 100
  const distance = levenshtein(a, b)
  const maxLen = Math.max(a.length, b.length)
  return Math.max(0, 100 * (1 - distance / maxLen))
}

function clamp01_100(n: number): number {
  if (!Number.isFinite(n)) return 0
  return Math.max(0, Math.min(100, n))
}

/** Group a column data type into a coarse semantic bucket. */
function typeBucket(dataType: string): 'text' | 'numeric' | 'timestamp' | 'boolean' | 'json' | 'other' {
  const t = dataType.toLowerCase()
  if (t.includes('timestamp') || t.includes('date') || t.includes('time')) return 'timestamp'
  if (
    t.includes('int') ||
    t.includes('numeric') ||
    t.includes('decimal') ||
    t.includes('real') ||
    t.includes('double') ||
    t.includes('float') ||
    t.includes('money')
  )
    return 'numeric'
  if (t.includes('bool')) return 'boolean'
  if (t.includes('json')) return 'json'
  if (t.includes('text') || t.includes('char') || t.includes('uuid')) return 'text'
  return 'other'
}

function jaccard<T>(a: Set<T>, b: Set<T>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const v of a) if (b.has(v)) intersection++
  const union = a.size + b.size - intersection
  if (union === 0) return 1
  return intersection / union
}

/**
 * Number of overlapping column pairs between two tables, using the column
 * synonym map. Each column on either side may match at most once (greedy match
 * in iteration order — sufficient for similarity heuristics).
 */
function findColumnPairs(
  cols1: ColumnDefinition[],
  cols2: ColumnDefinition[]
): Array<{ a: ColumnDefinition; b: ColumnDefinition }> {
  const used2 = new Set<number>()
  const pairs: Array<{ a: ColumnDefinition; b: ColumnDefinition }> = []
  for (const a of cols1) {
    const idx = cols2.findIndex(
      (b, i) => !used2.has(i) && areSynonyms(a.name, b.name, COLUMN_SYNONYMS)
    )
    if (idx !== -1) {
      used2.add(idx)
      pairs.push({ a, b: cols2[idx] })
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Name similarity (30%)
// ---------------------------------------------------------------------------

export function calculateNameSimilarity(name1: string, name2: string): number {
  // 1. Normalize (case + separators)
  const n1 = normalize(name1)
  const n2 = normalize(name2)
  if (n1 === n2) return 100

  // 2. Synonym map (canonical form keeps underscores so `user_accounts` matches)
  if (areSynonyms(name1, name2, TABLE_SYNONYMS)) return 90

  // 3. Levenshtein-based similarity
  let score = levenshteinSimilarity(n1, n2)

  // 4. Substring containment bonus (+15%, capped at 100)
  if (n1.length >= 2 && n2.length >= 2 && (n1.includes(n2) || n2.includes(n1))) {
    score = score * 1.15
  }

  return clamp01_100(score)
}

// ---------------------------------------------------------------------------
// Structure similarity (50%)
// ---------------------------------------------------------------------------

export function calculateStructureSimilarity(table1: TableSchema, table2: TableSchema): number {
  const cols1 = table1.columns
  const cols2 = table2.columns

  // 1. Column count ratio
  const countRatio =
    Math.max(cols1.length, cols2.length) === 0
      ? 1
      : Math.min(cols1.length, cols2.length) / Math.max(cols1.length, cols2.length)

  // 2. Column name overlap (Jaccard over a synonym-aware equivalence).
  //    To respect synonyms we count pairs found via findColumnPairs and treat
  //    them as the intersection.
  const pairs = findColumnPairs(cols1, cols2)
  const intersection = pairs.length
  const union = cols1.length + cols2.length - intersection
  const nameOverlap = union === 0 ? 1 : intersection / union

  // 3. Type matching among overlapping columns
  let typeMatch = 1
  if (pairs.length > 0) {
    const matches = pairs.filter((p) => typeBucket(p.a.dataType) === typeBucket(p.b.dataType)).length
    typeMatch = matches / pairs.length
  }

  // 4. Constraint similarity: PK/FK/UNIQUE patterns
  const constraintScore = compareConstraintPatterns(table1, table2)

  // 5. Index similarity: overlap of indexed-column sets
  const indexScore = compareIndexes(table1, table2)

  // Weighted blend within structure
  //   columns (count + overlap + types) carry the most weight, since they are
  //   what truly defines a table; constraints/indexes are supporting signals.
  const score =
    countRatio * 100 * 0.2 +
    nameOverlap * 100 * 0.35 +
    typeMatch * 100 * 0.25 +
    constraintScore * 0.1 +
    indexScore * 0.1

  return clamp01_100(score)
}

function compareConstraintPatterns(t1: TableSchema, t2: TableSchema): number {
  // PK arity
  const pkScore = t1.primaryKey.length === t2.primaryKey.length ? 1 : 0.5

  // FK count similarity
  const fk1 = t1.foreignKeys.length
  const fk2 = t2.foreignKeys.length
  const fkScore =
    fk1 === 0 && fk2 === 0
      ? 1
      : Math.max(fk1, fk2) === 0
        ? 1
        : Math.min(fk1, fk2) / Math.max(fk1, fk2)

  // UNIQUE constraint count similarity (derived from column constraint flags)
  const uniq1 = t1.columns.filter((c) => c.constraints.includes('UNIQUE')).length
  const uniq2 = t2.columns.filter((c) => c.constraints.includes('UNIQUE')).length
  const uniqScore =
    uniq1 === 0 && uniq2 === 0
      ? 1
      : Math.max(uniq1, uniq2) === 0
        ? 1
        : Math.min(uniq1, uniq2) / Math.max(uniq1, uniq2)

  return ((pkScore + fkScore + uniqScore) / 3) * 100
}

function compareIndexes(t1: TableSchema, t2: TableSchema): number {
  if (t1.indexes.length === 0 && t2.indexes.length === 0) return 100

  // Build sets of canonical "column group" keys per side.
  const keysFor = (table: TableSchema) =>
    new Set(table.indexes.map((idx) => idx.columns.map((c) => canonical(c)).sort().join('|')))

  const set1 = keysFor(t1)
  const set2 = keysFor(t2)

  // Synonym-aware intersection: two index keys match if every column in the
  // shorter key has a synonym match in the longer key.
  let intersection = 0
  const used2 = new Set<string>()
  for (const k1 of set1) {
    const cols1 = k1.split('|')
    for (const k2 of set2) {
      if (used2.has(k2)) continue
      const cols2 = k2.split('|')
      if (cols1.length !== cols2.length) continue
      const allMatch = cols1.every((c, i) => areSynonyms(c, cols2[i], COLUMN_SYNONYMS))
      if (allMatch) {
        intersection++
        used2.add(k2)
        break
      }
    }
  }

  const union = set1.size + set2.size - intersection
  return union === 0 ? 100 : (intersection / union) * 100
}

// ---------------------------------------------------------------------------
// Semantic similarity (20%)
// ---------------------------------------------------------------------------

export function calculateSemanticSimilarity(table1: TableSchema, table2: TableSchema): number {
  // 1. Foreign key relationship pattern similarity (number + arity of FKs)
  const fkPattern = compareFkPatterns(table1, table2)

  // 2. Column naming convention consistency (snake_case prevalence)
  const namingPattern = compareNamingConventions(table1, table2)

  // 3. Data type distribution similarity
  const typeDistribution = compareTypeDistribution(table1, table2)

  // 4. Timestamp column pattern recognition
  const timestampPattern = compareTimestampPatterns(table1, table2)

  const score =
    fkPattern * 0.3 + namingPattern * 0.2 + typeDistribution * 0.3 + timestampPattern * 0.2

  return clamp01_100(score)
}

function compareFkPatterns(t1: TableSchema, t2: TableSchema): number {
  const fk1 = t1.foreignKeys
  const fk2 = t2.foreignKeys

  if (fk1.length === 0 && fk2.length === 0) return 100

  const countSim =
    Math.max(fk1.length, fk2.length) === 0
      ? 1
      : Math.min(fk1.length, fk2.length) / Math.max(fk1.length, fk2.length)

  // Arity similarity: average column count of FK constraints
  const avgArity = (fks: typeof fk1) =>
    fks.length === 0 ? 0 : fks.reduce((acc, f) => acc + f.columns.length, 0) / fks.length

  const a1 = avgArity(fk1)
  const a2 = avgArity(fk2)
  const aritySim = Math.max(a1, a2) === 0 ? 1 : Math.min(a1, a2) / Math.max(a1, a2)

  return ((countSim + aritySim) / 2) * 100
}

const SNAKE_CASE = /^[a-z][a-z0-9_]*$/

function snakeRatio(table: TableSchema): number {
  if (table.columns.length === 0) return 1
  const snake = table.columns.filter((c) => SNAKE_CASE.test(c.name)).length
  return snake / table.columns.length
}

function compareNamingConventions(t1: TableSchema, t2: TableSchema): number {
  const r1 = snakeRatio(t1)
  const r2 = snakeRatio(t2)
  // Closer ratios → higher score
  return (1 - Math.abs(r1 - r2)) * 100
}

function compareTypeDistribution(t1: TableSchema, t2: TableSchema): number {
  const buckets = ['text', 'numeric', 'timestamp', 'boolean', 'json', 'other'] as const

  const distribution = (table: TableSchema) => {
    const total = table.columns.length || 1
    const counts: Record<(typeof buckets)[number], number> = {
      text: 0,
      numeric: 0,
      timestamp: 0,
      boolean: 0,
      json: 0,
      other: 0,
    }
    for (const col of table.columns) counts[typeBucket(col.dataType)]++
    return buckets.map((b) => counts[b] / total)
  }

  const d1 = distribution(t1)
  const d2 = distribution(t2)

  // 1 - half the L1 distance gives a [0, 1] similarity for probability vectors.
  let l1 = 0
  for (let i = 0; i < buckets.length; i++) l1 += Math.abs(d1[i] - d2[i])
  return (1 - l1 / 2) * 100
}

function compareTimestampPatterns(t1: TableSchema, t2: TableSchema): number {
  const hasCreated = (table: TableSchema) =>
    table.columns.some((c) => /^(created_at|created_timestamp|createdat)$/i.test(c.name))
  const hasUpdated = (table: TableSchema) =>
    table.columns.some((c) => /^(updated_at|updated_timestamp|updatedat)$/i.test(c.name))

  const sig1 = [hasCreated(t1), hasUpdated(t1)]
  const sig2 = [hasCreated(t2), hasUpdated(t2)]

  const matches = sig1.filter((v, i) => v === sig2[i]).length
  return (matches / sig1.length) * 100
}

// ---------------------------------------------------------------------------
// Composite + classification
// ---------------------------------------------------------------------------

export function classifySimilarity(score: number): SimilarityClassification {
  if (score >= 90) return 'exact'
  if (score >= 75) return 'likely_similar'
  if (score >= 50) return 'partial'
  return 'different'
}

export function calculateSimilarity(
  table1: TableSchema,
  table2: TableSchema
): { score: number; breakdown: SimilarityBreakdown; classification: SimilarityClassification } {
  const name = clamp01_100(calculateNameSimilarity(table1.tableName, table2.tableName))
  const structure = clamp01_100(calculateStructureSimilarity(table1, table2))
  const semantic = clamp01_100(calculateSemanticSimilarity(table1, table2))

  const score = clamp01_100(name * 0.3 + structure * 0.5 + semantic * 0.2)

  return {
    score,
    breakdown: { name, structure, semantic },
    classification: classifySimilarity(score),
  }
}
