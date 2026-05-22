import { ALL_PROJECTS_SCHEMAS, getProjectSchema } from './__mocks__/data'
import { calculateSimilarity, calculateSimilarityBreakdown } from './similarity'
import type {
  AnalysisOverview,
  MatrixCell,
  ProjectStandardization,
  SchemaMatrix,
  SimilarityPair,
  TableSchema,
} from './types'

const CACHE_TTL_MS = 60 * 60 * 1000

interface CacheEntry {
  schema: TableSchema[]
  cachedAt: number
}

const cache = new Map<string, CacheEntry>()

export function cacheSchemaSnapshot(projectId: string, schema: TableSchema[]): void {
  cache.set(projectId, { schema, cachedAt: Date.now() })
}

export function getCachedSchema(projectId: string): TableSchema[] | null {
  const entry = cache.get(projectId)
  if (!entry) return null
  if (Date.now() - entry.cachedAt > CACHE_TTL_MS) {
    cache.delete(projectId)
    return null
  }
  return entry.schema
}

export function clearSchemaCache(): void {
  cache.clear()
}

export async function fetchProjectSchema(projectId: string): Promise<TableSchema[]> {
  const cached = getCachedSchema(projectId)
  if (cached) return cached
  const schema = getProjectSchema(projectId)
  cacheSchemaSnapshot(projectId, schema)
  return schema
}

export async function getAllProjectsSchemas(): Promise<Map<string, TableSchema[]>> {
  const result = new Map<string, TableSchema[]>()
  for (const projectId of Object.keys(ALL_PROJECTS_SCHEMAS)) {
    result.set(projectId, await fetchProjectSchema(projectId))
  }
  return result
}

const SIMILARITY_THRESHOLD = 75

export function computeSimilarities(
  schemas: Map<string, TableSchema[]>
): SimilarityPair[] {
  const pairs: SimilarityPair[] = []
  const entries = Array.from(schemas.entries())

  for (let i = 0; i < entries.length; i++) {
    const [projectA, tablesA] = entries[i]
    for (let j = i + 1; j < entries.length; j++) {
      const [projectB, tablesB] = entries[j]
      for (const tableA of tablesA) {
        for (const tableB of tablesB) {
          const score = calculateSimilarity(tableA, tableB)
          if (score >= SIMILARITY_THRESHOLD) {
            pairs.push({
              projectA,
              tableA: tableA.tableName,
              projectB,
              tableB: tableB.tableName,
              score,
              breakdown: calculateSimilarityBreakdown(tableA, tableB),
            })
          }
        }
      }
    }
  }
  pairs.sort((a, b) => b.score - a.score)
  return pairs
}

function chooseCanonicalName(group: Set<string>): string {
  // Prefer the shortest, alphabetically-first name as canonical
  return Array.from(group).sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
}

export function buildSchemaMatrix(
  schemas: Map<string, TableSchema[]>,
  similarities: SimilarityPair[]
): SchemaMatrix {
  const projects = Array.from(schemas.keys()).sort()

  // Build equivalence groups: a tableName per project that belong to the same canonical concept
  const groups = new Map<string, Set<string>>()

  const keyFor = (projectId: string, tableName: string) => `${projectId}::${tableName}`
  const ensureGroup = (key: string) => {
    if (!groups.has(key)) groups.set(key, new Set([key]))
    return groups.get(key)!
  }
  const merge = (k1: string, k2: string) => {
    const g1 = ensureGroup(k1)
    const g2 = ensureGroup(k2)
    if (g1 === g2) return
    for (const m of g2) {
      g1.add(m)
      groups.set(m, g1)
    }
  }

  // Seed with every table
  for (const [projectId, tables] of schemas) {
    for (const t of tables) ensureGroup(keyFor(projectId, t.tableName))
  }

  // Merge by similarity pairs
  for (const pair of similarities) {
    merge(keyFor(pair.projectA, pair.tableA), keyFor(pair.projectB, pair.tableB))
  }

  // Collect unique groups and canonical name per group
  const uniqueGroups = new Set<Set<string>>()
  for (const g of groups.values()) uniqueGroups.add(g)

  const canonicalNames: string[] = []
  const cells: Record<string, Record<string, MatrixCell>> = {}

  for (const group of uniqueGroups) {
    const tableNames = new Set<string>()
    for (const member of group) tableNames.add(member.split('::')[1])
    const canonical = chooseCanonicalName(tableNames)
    if (cells[canonical]) {
      // collision; suffix with index
      let suffix = 2
      while (cells[`${canonical}_${suffix}`]) suffix += 1
      canonicalNames.push(`${canonical}_${suffix}`)
    } else {
      canonicalNames.push(canonical)
    }
    const canonicalKey = canonicalNames[canonicalNames.length - 1]

    cells[canonicalKey] = {}
    for (const projectId of projects) {
      const member = Array.from(group).find((m) => m.startsWith(`${projectId}::`))
      if (!member) {
        cells[canonicalKey][projectId] = { exists: false }
      } else {
        const tableName = member.split('::')[1]
        const cell: MatrixCell = {
          exists: true,
          variantName: tableName === canonicalKey ? undefined : tableName,
        }
        const matchingPair = similarities.find(
          (p) =>
            (p.projectA === projectId && p.tableA === tableName) ||
            (p.projectB === projectId && p.tableB === tableName)
        )
        if (matchingPair) cell.similarityScore = matchingPair.score
        else if (tableName === canonicalKey) cell.similarityScore = 100
        cells[canonicalKey][projectId] = cell
      }
    }
  }

  canonicalNames.sort()
  return { projects, canonicalTables: canonicalNames, cells, similarities }
}

export function computeOverview(
  schemas: Map<string, TableSchema[]>,
  matrix: SchemaMatrix
): AnalysisOverview {
  const projects = Array.from(schemas.keys())
  const totalTables = Array.from(schemas.values()).reduce((sum, t) => sum + t.length, 0)

  const perProject: ProjectStandardization[] = projects.map((projectId) => {
    const tables = schemas.get(projectId) ?? []
    let matching = 0
    for (const canonical of matrix.canonicalTables) {
      const cell = matrix.cells[canonical]?.[projectId]
      if (cell?.exists && (cell.similarityScore ?? 0) >= 90) matching += 1
    }
    const totalCanonical = matrix.canonicalTables.length || 1
    const score = Math.round((matching / totalCanonical) * 100)
    return {
      projectId,
      standardizationScore: score,
      totalTables: tables.length,
      matchingTables: matching,
      pendingMigrations: 0,
    }
  })

  const overallStandardization =
    perProject.length === 0
      ? 0
      : Math.round(
          perProject.reduce((sum, p) => sum + p.standardizationScore, 0) /
            perProject.length
        )

  return {
    overallStandardization,
    totalProjects: projects.length,
    totalTables,
    similarTablePairs: matrix.similarities.length,
    lastSyncAt: new Date().toISOString(),
    perProject,
  }
}
