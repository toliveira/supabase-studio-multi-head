/**
 * Recommendation Engine
 *
 * Consumes the cross-project schemas map and the similarity pairs produced by
 * the schema analyzer, then derives a prioritized list of actionable
 * recommendations:
 *
 *   - rename      : tables whose structure matches a more popular variant
 *                   under a different name
 *   - add_table   : tables present in a majority of projects but missing in
 *                   one or more others
 *   - columns     : column renames within already-similar tables, surfaced
 *                   via the column synonym map
 *
 * Recommendations are sorted by confidence descending. Each recommendation
 * carries a deterministic, monotonic id (`rec-1`, `rec-2`, …) — call
 * {@link resetIdCounter} between independent runs to keep tests deterministic.
 */

import { calculateNameSimilarity } from '@/lib/schema-analysis/similarity'
import type {
  ColumnMapping,
  Recommendation,
  SimilarityPair,
  TableSchema,
} from '@/lib/schema-analysis/types'

// ---------------------------------------------------------------------------
// ID generation
// ---------------------------------------------------------------------------

let idCounter = 0

function nextId(): string {
  idCounter += 1
  return `rec-${idCounter}`
}

export function resetIdCounter(): void {
  idCounter = 0
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const RENAME_MIN_SCORE = 75
/**
 * Threshold for treating two column names as synonyms in the columns rule.
 *
 * The spec calls for `calculateNameSimilarity >= 90`, but the table-level
 * name similarity function only injects synonym knowledge for TABLE_SYNONYMS;
 * column synonyms like `email` ↔ `email_address` score in the 40-70 range via
 * the Levenshtein + substring heuristic alone. To still surface those column
 * renames we keep the spec's 90 threshold AND apply a supplementary
 * column-aware synonym map below.
 */
const COLUMN_NAME_MIN_SCORE = 90

/**
 * Column-level synonyms used to recognize cross-project column renames. Kept
 * symmetric (handled by {@link areColumnSynonyms}). Mirrors the set used by
 * the similarity engine but is duplicated here because it isn't exported.
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

function areColumnSynonyms(a: string, b: string): boolean {
  const ca = a.toLowerCase().trim()
  const cb = b.toLowerCase().trim()
  if (ca === cb) return true
  return (
    (COLUMN_SYNONYMS[ca]?.includes(cb) ?? false) ||
    (COLUMN_SYNONYMS[cb]?.includes(ca) ?? false)
  )
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n))
}

function findTable(
  allSchemas: Record<string, TableSchema[]>,
  projectId: string,
  tableName: string
): TableSchema | undefined {
  return (allSchemas[projectId] ?? []).find((t) => t.tableName === tableName)
}

/**
 * Group similar tables across projects into "structure clusters" so we can
 * pick the canonical name (the variant that occurs in the most projects).
 *
 * Uses a union-find over (projectId, tableName) keys, joining any pair with
 * `score >= RENAME_MIN_SCORE`.
 */
interface TableCluster {
  /** projectId -> tableName actually present in that project */
  projectTable: Map<string, string>
  /** Set of "tableName" variants in this cluster */
  variants: Set<string>
  /** Highest-scoring pair seen joining this cluster (for confidence). */
  bestPairScore: number
}

function keyFor(projectId: string, tableName: string): string {
  return `${projectId}::${tableName}`
}

function clusterByStructure(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): TableCluster[] {
  const parent = new Map<string, string>()
  const tableKeys = new Set<string>()

  // Seed every (projectId, tableName) as its own component.
  for (const projectId of Object.keys(allSchemas)) {
    for (const table of allSchemas[projectId] ?? []) {
      const k = keyFor(projectId, table.tableName)
      parent.set(k, k)
      tableKeys.add(k)
    }
  }

  const find = (x: string): string => {
    let cur = x
    while (parent.get(cur) !== cur) {
      const p = parent.get(cur)!
      parent.set(cur, parent.get(p)!)
      cur = parent.get(cur)!
    }
    return cur
  }

  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  // Union any pair that's at least likely-similar.
  for (const pair of similarities) {
    if (pair.score < RENAME_MIN_SCORE) continue
    const a = keyFor(pair.table1.projectId, pair.table1.tableName)
    const b = keyFor(pair.table2.projectId, pair.table2.tableName)
    if (parent.has(a) && parent.has(b)) union(a, b)
  }

  // Track the best score per representative for confidence calculations.
  const bestScoreByRoot = new Map<string, number>()
  for (const pair of similarities) {
    if (pair.score < RENAME_MIN_SCORE) continue
    const a = keyFor(pair.table1.projectId, pair.table1.tableName)
    if (!parent.has(a)) continue
    const root = find(a)
    const prev = bestScoreByRoot.get(root) ?? 0
    if (pair.score > prev) bestScoreByRoot.set(root, pair.score)
  }

  // Materialize clusters.
  const clustersByRoot = new Map<string, TableCluster>()
  for (const k of tableKeys) {
    const root = find(k)
    let cluster = clustersByRoot.get(root)
    if (!cluster) {
      cluster = {
        projectTable: new Map(),
        variants: new Set(),
        bestPairScore: bestScoreByRoot.get(root) ?? 0,
      }
      clustersByRoot.set(root, cluster)
    }
    const [projectId, tableName] = k.split('::')
    // First write wins per project — should never collide because each project
    // has unique table names.
    if (!cluster.projectTable.has(projectId)) {
      cluster.projectTable.set(projectId, tableName)
    }
    cluster.variants.add(tableName)
  }

  return Array.from(clustersByRoot.values())
}

/**
 * Pick the canonical table name for a cluster: the variant with the highest
 * occurrence across projects, ties broken alphabetically for determinism.
 */
function pickCanonicalName(cluster: TableCluster): string {
  const counts = new Map<string, number>()
  for (const name of cluster.projectTable.values()) {
    counts.set(name, (counts.get(name) ?? 0) + 1)
  }
  let best: string | undefined
  let bestCount = -1
  for (const [name, count] of counts) {
    if (count > bestCount || (count === bestCount && (best === undefined || name < best))) {
      best = name
      bestCount = count
    }
  }
  return best ?? cluster.variants.values().next().value ?? ''
}

/**
 * Find column synonym mappings between two tables using the same heuristic as
 * the similarity algorithm (calculateNameSimilarity >= 90 captures both
 * normalized-equal names and synonym-map hits).
 *
 * Only returns mappings where the column actually has a *different* name on
 * the two sides — same-named columns don't need a rename.
 */
function findColumnMappings(
  from: TableSchema,
  to: TableSchema
): ColumnMapping[] {
  const mappings: ColumnMapping[] = []
  const usedTo = new Set<number>()

  for (const colFrom of from.columns) {
    let bestIdx = -1
    let bestScore = 0
    for (let i = 0; i < to.columns.length; i++) {
      if (usedTo.has(i)) continue
      const score = calculateNameSimilarity(colFrom.name, to.columns[i].name)
      const isMatch =
        score >= COLUMN_NAME_MIN_SCORE ||
        areColumnSynonyms(colFrom.name, to.columns[i].name)
      if (isMatch && score >= bestScore) {
        bestScore = score
        bestIdx = i
      }
    }
    if (bestIdx !== -1) {
      usedTo.add(bestIdx)
      const target = to.columns[bestIdx]
      if (colFrom.name !== target.name) {
        mappings.push({ from: colFrom.name, to: target.name })
      }
    }
  }

  return mappings
}

// ---------------------------------------------------------------------------
// Rule 1: RENAME
// ---------------------------------------------------------------------------

interface RenameContext {
  cluster: TableCluster
  canonical: string
  /** projectId of one project whose table is already on the canonical name. */
  baselineProject: string
  variantProjects: string[]
}

function buildRenameRecommendations(
  clusters: TableCluster[]
): {
  recommendations: Recommendation[]
  renameContexts: RenameContext[]
} {
  const recommendations: Recommendation[] = []
  const renameContexts: RenameContext[] = []

  for (const cluster of clusters) {
    // Need at least two projects to talk about renames.
    if (cluster.projectTable.size < 2) continue

    const canonical = pickCanonicalName(cluster)
    const variants = new Set<string>()
    for (const name of cluster.projectTable.values()) {
      if (name !== canonical) variants.add(name)
    }
    if (variants.size === 0) continue

    // Find the baseline project (any project already using the canonical name).
    let baselineProject: string | undefined
    for (const [projectId, tableName] of cluster.projectTable) {
      if (tableName === canonical) {
        baselineProject = projectId
        break
      }
    }
    if (!baselineProject) continue

    // One recommendation per distinct variant name.
    for (const variant of variants) {
      const affectedProjects: string[] = []
      for (const [projectId, tableName] of cluster.projectTable) {
        if (tableName === variant) affectedProjects.push(projectId)
      }
      if (affectedProjects.length === 0) continue

      const confidence = clamp(cluster.bestPairScore / 100 + 0.05, 0.7, 1.0)
      recommendations.push({
        id: nextId(),
        type: 'rename',
        title: `Rename ${variant} → ${canonical}`,
        description: `Table "${variant}" appears structurally equivalent to "${canonical}" used by project "${baselineProject}". Renaming standardizes table naming across projects.`,
        confidence,
        effort: 'medium',
        affectedProjects,
        baselineProject,
        affectedTables: [variant],
      })
    }

    renameContexts.push({
      cluster,
      canonical,
      baselineProject,
      variantProjects: Array.from(cluster.projectTable.entries())
        .filter(([, name]) => name !== canonical)
        .map(([projectId]) => projectId),
    })
  }

  return { recommendations, renameContexts }
}

// ---------------------------------------------------------------------------
// Rule 2: ADD_TABLE
// ---------------------------------------------------------------------------

function buildAddTableRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  clusters: TableCluster[]
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const projectIds = Object.keys(allSchemas)
  const totalProjects = projectIds.length
  if (totalProjects === 0) return recommendations

  const halfThreshold = Math.ceil(totalProjects / 2)

  for (const cluster of clusters) {
    const presentIn = Array.from(cluster.projectTable.keys())
    if (presentIn.length < halfThreshold) continue
    const missingIn = projectIds.filter((p) => !cluster.projectTable.has(p))
    if (missingIn.length === 0) continue

    const canonical = pickCanonicalName(cluster)
    // Pick a baseline project that has the canonical-named table, falling back
    // to any project that has any variant.
    const baselineProject =
      Array.from(cluster.projectTable.entries()).find(
        ([, name]) => name === canonical
      )?.[0] ?? presentIn[0]

    const confidence = clamp(
      0.7 + (presentIn.length / totalProjects) * 0.2,
      0.7,
      1.0
    )

    recommendations.push({
      id: nextId(),
      type: 'add_table',
      title: `Add ${canonical} to ${missingIn.length} project${missingIn.length === 1 ? '' : 's'}`,
      description: `Table "${canonical}" exists in ${presentIn.length}/${totalProjects} projects but is missing in ${missingIn.join(', ')}. Consider adding it to keep schemas aligned with the baseline from "${baselineProject}".`,
      confidence,
      effort: 'high',
      affectedProjects: missingIn,
      baselineProject,
      affectedTables: [canonical],
    })
  }

  return recommendations
}

// ---------------------------------------------------------------------------
// Rule 3: COLUMNS
// ---------------------------------------------------------------------------

function buildColumnRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const recommendations: Recommendation[] = []
  const seen = new Set<string>() // dedupe by (project,table)->(project,table)

  for (const pair of similarities) {
    if (pair.score < RENAME_MIN_SCORE) continue

    const t1 = findTable(allSchemas, pair.table1.projectId, pair.table1.tableName)
    const t2 = findTable(allSchemas, pair.table2.projectId, pair.table2.tableName)
    if (!t1 || !t2) continue

    // We always describe the mapping in the direction `variant -> baseline`.
    // Choose t2 as the baseline if its name is more popular (already canonical
    // across projects) — otherwise default to t1 as baseline. Cheap heuristic
    // that's good enough for now: shorter name wins ties, otherwise lexical.
    const baseline = t1.tableName <= t2.tableName ? t1 : t2
    const variant = baseline === t1 ? t2 : t1

    const dedupeKey = `${variant.projectId}::${variant.tableName}->${baseline.projectId}::${baseline.tableName}`
    if (seen.has(dedupeKey)) continue
    seen.add(dedupeKey)

    const columnMappings = findColumnMappings(variant, baseline)
    if (columnMappings.length === 0) continue

    const confidence = clamp(pair.score / 100 + 0.02, 0.7, 1.0)
    const effort: 'low' | 'medium' = columnMappings.length <= 2 ? 'low' : 'medium'

    recommendations.push({
      id: nextId(),
      type: 'columns',
      title: `Rename ${columnMappings.length} column${columnMappings.length === 1 ? '' : 's'} in ${variant.tableName}`,
      description: `Columns in "${variant.tableName}" (project "${variant.projectId}") appear to be synonyms of columns in "${baseline.tableName}" (project "${baseline.projectId}"). Aligning column names improves cross-project consistency.`,
      confidence,
      effort,
      affectedProjects: [variant.projectId],
      baselineProject: baseline.projectId,
      affectedTables: [variant.tableName],
      columnMappings,
    })
  }

  return recommendations
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function generateRecommendations(
  allSchemas: Record<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const clusters = clusterByStructure(allSchemas, similarities)
  const { recommendations: renameRecs } = buildRenameRecommendations(clusters)
  const addTableRecs = buildAddTableRecommendations(allSchemas, clusters)
  const columnRecs = buildColumnRecommendations(allSchemas, similarities)

  const all = [...renameRecs, ...addTableRecs, ...columnRecs]
  // Stable-ish sort: primary by confidence desc, secondary by id ascending so
  // that ties preserve creation order.
  all.sort((a, b) => {
    if (b.confidence !== a.confidence) return b.confidence - a.confidence
    const aNum = parseInt(a.id.split('-')[1], 10)
    const bNum = parseInt(b.id.split('-')[1], 10)
    return aNum - bNum
  })

  return all
}
