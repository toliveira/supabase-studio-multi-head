/**
 * Schema Analyzer
 *
 * Orchestrates cross-project schema comparison. Consumes table schemas from
 * multiple projects, runs the similarity algorithm pairwise across projects,
 * builds a canonical-name matrix for UI consumption, and produces an overall
 * standardization score.
 *
 * Also exposes a tiny in-memory cache (1-hour TTL) so API handlers can avoid
 * re-introspecting the same project on every request.
 */

import {
  calculateSimilarity,
  classifySimilarity,
} from '@/lib/schema-analysis/similarity'
import type {
  AnalysisResult,
  MatrixCell,
  MatrixRow,
  SchemaMatrix,
  SimilarityPair,
  TableSchema,
} from '@/lib/schema-analysis/types'

// ---------------------------------------------------------------------------
// Cache
// ---------------------------------------------------------------------------

const CACHE_TTL_MS = 60 * 60 * 1000 // 1 hour

interface CacheEntry {
  schemas: TableSchema[]
  timestamp: number
}

const schemaCache = new Map<string, CacheEntry>()

const cacheKey = (projectId: string) => `schema:${projectId}`

export function cacheSchemaSnapshot(projectId: string, schemas: TableSchema[]): void {
  schemaCache.set(cacheKey(projectId), {
    schemas,
    timestamp: Date.now(),
  })
}

export function getCachedSchema(projectId: string): TableSchema[] | null {
  const entry = schemaCache.get(cacheKey(projectId))
  if (!entry) return null
  if (Date.now() - entry.timestamp > CACHE_TTL_MS) {
    schemaCache.delete(cacheKey(projectId))
    return null
  }
  return entry.schemas
}

export function clearSchemaCache(): void {
  schemaCache.clear()
}

// ---------------------------------------------------------------------------
// Cross-project similarity computation
// ---------------------------------------------------------------------------

/**
 * Compare every table in project A with every table in project B, for every
 * (A, B) unordered project pair where A !== B. Keeps only pairs with
 * score >= `minScore` and sorts the result descending by score.
 */
function computePairs(
  allSchemas: Record<string, TableSchema[]>,
  minScore = 50
): SimilarityPair[] {
  const projectIds = Object.keys(allSchemas)
  const pairs: SimilarityPair[] = []

  for (let i = 0; i < projectIds.length; i++) {
    for (let j = i + 1; j < projectIds.length; j++) {
      const tablesA = allSchemas[projectIds[i]] ?? []
      const tablesB = allSchemas[projectIds[j]] ?? []
      for (const t1 of tablesA) {
        for (const t2 of tablesB) {
          const { score, breakdown, classification } = calculateSimilarity(t1, t2)
          if (score >= minScore) {
            pairs.push({
              table1: { projectId: t1.projectId, tableName: t1.tableName },
              table2: { projectId: t2.projectId, tableName: t2.tableName },
              score,
              breakdown,
              classification,
            })
          }
        }
      }
    }
  }

  pairs.sort((a, b) => b.score - a.score)
  return pairs
}

// ---------------------------------------------------------------------------
// Matrix builder
// ---------------------------------------------------------------------------

interface CanonicalGroup {
  /** Canonical table name (the most common variant). */
  name: string
  /** All variant names that belong to this group. */
  variants: Set<string>
  /** projectId -> tableName actually present in that project (variant or canonical). */
  projectTable: Map<string, string>
}

/**
 * Group table names across projects by similarity. Two tables join the same
 * group if their pairwise similarity is >= `groupingThreshold` (default 75 →
 * "likely similar" or stronger).
 *
 * The canonical name for the group is the variant that appears in the most
 * projects (ties broken alphabetically for determinism).
 */
function groupTablesByCanonicalName(
  allSchemas: Record<string, TableSchema[]>,
  groupingThreshold = 75
): CanonicalGroup[] {
  // Flatten to (projectId, table) pairs, preserving project order.
  const flat: TableSchema[] = []
  for (const projectId of Object.keys(allSchemas)) {
    for (const t of allSchemas[projectId] ?? []) flat.push(t)
  }

  const groups: CanonicalGroup[] = []

  for (const table of flat) {
    // Try to attach to an existing group.
    let attached: CanonicalGroup | undefined
    for (const group of groups) {
      // A table joins a group if it is similar to any existing member.
      // To keep the comparison cheap we compare against a single
      // representative variant per project already in the group.
      let isSimilar = false
      for (const memberName of group.variants) {
        // Find a representative table with this name from any project.
        const rep = findTableByName(flat, memberName)
        if (!rep) continue
        const { score } = calculateSimilarity(table, rep)
        if (score >= groupingThreshold) {
          isSimilar = true
          break
        }
      }
      if (isSimilar) {
        attached = group
        break
      }
    }

    if (attached) {
      attached.variants.add(table.tableName)
      // First-write-wins per project so each project maps to one variant.
      if (!attached.projectTable.has(table.projectId)) {
        attached.projectTable.set(table.projectId, table.tableName)
      }
    } else {
      const group: CanonicalGroup = {
        name: table.tableName,
        variants: new Set([table.tableName]),
        projectTable: new Map([[table.projectId, table.tableName]]),
      }
      groups.push(group)
    }
  }

  // Pick the canonical name: the variant that appears in the most projects.
  for (const group of groups) {
    const counts = new Map<string, number>()
    for (const variant of group.projectTable.values()) {
      counts.set(variant, (counts.get(variant) ?? 0) + 1)
    }
    let bestName = group.name
    let bestCount = -1
    for (const [name, count] of counts) {
      if (count > bestCount || (count === bestCount && name < bestName)) {
        bestName = name
        bestCount = count
      }
    }
    group.name = bestName
  }

  return groups
}

function findTableByName(tables: TableSchema[], name: string): TableSchema | undefined {
  return tables.find((t) => t.tableName === name)
}

export function buildSchemaMatrix(
  allSchemas: Record<string, TableSchema[]>
): SchemaMatrix {
  const projectIds = Object.keys(allSchemas)
  const groups = groupTablesByCanonicalName(allSchemas)

  const rows: MatrixRow[] = groups.map((group) => {
    const cells: Record<string, MatrixCell> = {}

    for (const projectId of projectIds) {
      const tables = allSchemas[projectId] ?? []
      const variantName = group.projectTable.get(projectId)

      if (!variantName) {
        cells[projectId] = {
          exists: false,
          tableName: null,
          similarityScore: null,
          classification: null,
        }
        continue
      }

      if (variantName === group.name) {
        // Exact-name match.
        cells[projectId] = {
          exists: true,
          tableName: null,
          similarityScore: null,
          classification: null,
        }
        continue
      }

      // Variant: compute its similarity to a canonical reference if one
      // exists in another project; otherwise fall back to comparing the
      // variant with itself (score = 100) — but in practice a canonical
      // reference will exist for any non-canonical variant.
      const variantTable = tables.find((t) => t.tableName === variantName)
      const canonicalRef = findCanonicalReference(allSchemas, group.name)

      let similarityScore: number | null = null
      let classification: MatrixCell['classification'] = null
      if (variantTable && canonicalRef) {
        const { score, classification: cls } = calculateSimilarity(
          variantTable,
          canonicalRef
        )
        similarityScore = score
        classification = cls
      } else if (variantTable) {
        // No canonical reference available; report the variant as a
        // perfect self-match.
        similarityScore = 100
        classification = classifySimilarity(100)
      }

      cells[projectId] = {
        exists: true,
        tableName: variantName,
        similarityScore,
        classification,
      }
    }

    return { canonicalName: group.name, cells }
  })

  return { projectIds, rows }
}

function findCanonicalReference(
  allSchemas: Record<string, TableSchema[]>,
  canonicalName: string
): TableSchema | undefined {
  for (const projectId of Object.keys(allSchemas)) {
    const match = (allSchemas[projectId] ?? []).find(
      (t) => t.tableName === canonicalName
    )
    if (match) return match
  }
  return undefined
}

// ---------------------------------------------------------------------------
// Standardization score
// ---------------------------------------------------------------------------

export function calculateStandardizationScore(
  allSchemas: Record<string, TableSchema[]>
): number {
  const matrix = buildSchemaMatrix(allSchemas)
  const projectCount = matrix.projectIds.length
  const rowCount = matrix.rows.length
  const totalCells = projectCount * rowCount
  if (totalCells === 0) return 0

  let exactMatches = 0
  for (const row of matrix.rows) {
    for (const projectId of matrix.projectIds) {
      const cell = row.cells[projectId]
      if (cell.exists && cell.tableName === null) exactMatches++
    }
  }

  return (exactMatches / totalCells) * 100
}

// ---------------------------------------------------------------------------
// Top-level analyzer
// ---------------------------------------------------------------------------

export function analyzeSchemas(
  allSchemas: Record<string, TableSchema[]>
): AnalysisResult {
  const similarities = computePairs(allSchemas, 50)
  const matrix = buildSchemaMatrix(allSchemas)
  const standardizationScore = calculateStandardizationScore(allSchemas)

  const totalProjects = Object.keys(allSchemas).length
  const uniqueTables = matrix.rows.length

  return {
    similarities,
    matrix,
    standardizationScore,
    totalProjects,
    uniqueTables,
    similarPairsCount: similarities.length,
    analyzedAt: new Date().toISOString(),
  }
}
