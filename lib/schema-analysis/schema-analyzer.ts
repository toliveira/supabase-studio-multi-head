import { ALL_PROJECTS, ALL_PROJECTS_SCHEMAS, getProjectSchema } from './__mocks__/data'
import { calculateSimilarity, similarityBreakdown } from './similarity'
import type { SimilarityPair, TableSchema } from './types'

export const CACHE_TTL_MS = 60 * 60 * 1000

interface CacheEntry {
  schema: TableSchema[]
  storedAt: number
}

const cache = new Map<string, CacheEntry>()

export function cacheSchemaSnapshot(projectId: string, schema: TableSchema[]): void {
  cache.set(projectId, { schema, storedAt: Date.now() })
}

export function getCachedSchema(projectId: string): TableSchema[] | null {
  const entry = cache.get(projectId)
  if (!entry) return null
  if (Date.now() - entry.storedAt > CACHE_TTL_MS) {
    cache.delete(projectId)
    return null
  }
  return entry.schema
}

export function clearSchemaCache(): void {
  cache.clear()
}

function shouldReturnMockData(): boolean {
  return process.env.NODE_ENV !== 'production'
}

export async function fetchProjectSchema(projectId: string): Promise<TableSchema[]> {
  const cached = getCachedSchema(projectId)
  if (cached) return cached

  if (shouldReturnMockData()) {
    const schema = getProjectSchema(projectId)
    cacheSchemaSnapshot(projectId, schema)
    return schema
  }

  throw new Error(
    `Live schema introspection is not configured. Wire fetchProjectSchema to pg-meta before running in production.`
  )
}

export async function listProjectIds(): Promise<string[]> {
  if (shouldReturnMockData()) return ALL_PROJECTS
  return Object.keys(ALL_PROJECTS_SCHEMAS)
}

export async function getAllProjectsSchemas(): Promise<Map<string, TableSchema[]>> {
  const ids = await listProjectIds()
  const result = new Map<string, TableSchema[]>()
  await Promise.all(
    ids.map(async (id) => {
      result.set(id, await fetchProjectSchema(id))
    })
  )
  return result
}

export function computeSimilarityPairs(
  schemas: Map<string, TableSchema[]>,
  threshold = 0
): SimilarityPair[] {
  const projects = [...schemas.keys()]
  const pairs: SimilarityPair[] = []

  for (let i = 0; i < projects.length; i++) {
    for (let j = i + 1; j < projects.length; j++) {
      const aTables = schemas.get(projects[i]) ?? []
      const bTables = schemas.get(projects[j]) ?? []
      for (const ta of aTables) {
        for (const tb of bTables) {
          const score = calculateSimilarity(ta, tb)
          if (score < threshold) continue
          pairs.push({
            projectA: projects[i],
            tableA: ta.tableName,
            projectB: projects[j],
            tableB: tb.tableName,
            score,
            breakdown: similarityBreakdown(ta, tb),
          })
        }
      }
    }
  }
  return pairs.sort((a, b) => b.score - a.score)
}
