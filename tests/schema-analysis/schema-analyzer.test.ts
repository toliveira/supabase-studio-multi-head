import { beforeEach, describe, expect, it } from 'vitest'

import {
  CACHE_TTL_MS,
  cacheSchemaSnapshot,
  clearSchemaCache,
  computeSimilarityPairs,
  fetchProjectSchema,
  getAllProjectsSchemas,
  getCachedSchema,
} from '@/lib/schema-analysis/schema-analyzer'

beforeEach(() => {
  clearSchemaCache()
})

describe('schema cache', () => {
  it('returns null when no snapshot is stored', () => {
    expect(getCachedSchema('project-a')).toBeNull()
  })

  it('returns stored snapshot before TTL elapses', () => {
    cacheSchemaSnapshot('project-a', [])
    expect(getCachedSchema('project-a')).toEqual([])
  })

  it('exposes a 1h TTL constant', () => {
    expect(CACHE_TTL_MS).toBe(60 * 60 * 1000)
  })
})

describe('fetchProjectSchema (mock mode)', () => {
  it('returns the 4 tables for project-a', async () => {
    const schema = await fetchProjectSchema('project-a')
    expect(schema.map((t) => t.tableName).sort()).toEqual(['audit_log', 'orders', 'products', 'users'])
  })

  it('caches subsequent calls', async () => {
    await fetchProjectSchema('project-a')
    expect(getCachedSchema('project-a')).not.toBeNull()
  })
})

describe('getAllProjectsSchemas', () => {
  it('returns a Map with all 4 mock projects', async () => {
    const all = await getAllProjectsSchemas()
    expect([...all.keys()].sort()).toEqual(['project-a', 'project-b', 'project-c', 'project-d'])
  })
})

describe('computeSimilarityPairs', () => {
  it('produces sorted descending scores', async () => {
    const all = await getAllProjectsSchemas()
    const pairs = computeSimilarityPairs(all, 75)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].score).toBeGreaterThanOrEqual(pairs[i].score)
    }
    expect(pairs.length).toBeGreaterThan(0)
  })
})
