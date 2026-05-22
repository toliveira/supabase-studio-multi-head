import { beforeEach, describe, expect, it } from 'vitest'

import { generateLargeSchema } from '@/lib/schema-analysis/__mocks__/data'
import {
  buildSchemaMatrix,
  cacheSchemaSnapshot,
  clearSchemaCache,
  computeOverview,
  computeSimilarities,
  fetchProjectSchema,
  getAllProjectsSchemas,
  getCachedSchema,
} from '@/lib/schema-analysis/schema-analyzer'

describe('schema-analyzer cache', () => {
  beforeEach(() => {
    clearSchemaCache()
  })

  it('stores and retrieves a schema snapshot', () => {
    const fake = generateLargeSchema('proj-x', 1)
    cacheSchemaSnapshot('proj-x', fake)
    expect(getCachedSchema('proj-x')).toEqual(fake)
  })

  it('returns null when no cache exists', () => {
    expect(getCachedSchema('nope')).toBeNull()
  })
})

describe('fetchProjectSchema', () => {
  beforeEach(() => clearSchemaCache())

  it('returns the mock schema for a known project', async () => {
    const schema = await fetchProjectSchema('project-a')
    expect(schema.length).toBeGreaterThan(0)
    expect(schema[0].projectId).toBe('project-a')
  })

  it('caches results after fetch', async () => {
    await fetchProjectSchema('project-a')
    expect(getCachedSchema('project-a')).not.toBeNull()
  })
})

describe('getAllProjectsSchemas', () => {
  it('returns a map keyed by project id', async () => {
    const map = await getAllProjectsSchemas()
    expect(map.size).toBe(4)
    expect(map.has('project-a')).toBe(true)
    expect(map.has('project-d')).toBe(true)
  })
})

describe('computeSimilarities', () => {
  it('flags cross-project similar table pairs', async () => {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarities(schemas)
    expect(pairs.length).toBeGreaterThan(0)
    expect(pairs.every((p) => p.score >= 75)).toBe(true)
    expect(pairs.every((p) => p.projectA !== p.projectB)).toBe(true)
  })

  it('sorts pairs by score descending', async () => {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarities(schemas)
    for (let i = 1; i < pairs.length; i++) {
      expect(pairs[i - 1].score).toBeGreaterThanOrEqual(pairs[i].score)
    }
  })
})

describe('buildSchemaMatrix', () => {
  it('produces a matrix covering all projects', async () => {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarities(schemas)
    const matrix = buildSchemaMatrix(schemas, pairs)
    expect(matrix.projects.length).toBe(4)
    expect(matrix.canonicalTables.length).toBeGreaterThan(0)
    for (const tableName of matrix.canonicalTables) {
      for (const projectId of matrix.projects) {
        expect(matrix.cells[tableName][projectId]).toBeDefined()
      }
    }
  })

  it('marks missing tables correctly', async () => {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarities(schemas)
    const matrix = buildSchemaMatrix(schemas, pairs)
    // project-d only has 2 tables — so at least 2 missing-table cells should exist for it
    const dMissing = matrix.canonicalTables.filter(
      (t) => !matrix.cells[t]['project-d'].exists
    )
    expect(dMissing.length).toBeGreaterThanOrEqual(2)
  })
})

describe('computeOverview', () => {
  it('returns standardization stats', async () => {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarities(schemas)
    const matrix = buildSchemaMatrix(schemas, pairs)
    const overview = computeOverview(schemas, matrix)
    expect(overview.totalProjects).toBe(4)
    expect(overview.totalTables).toBeGreaterThan(0)
    expect(overview.perProject.length).toBe(4)
    expect(overview.overallStandardization).toBeGreaterThanOrEqual(0)
    expect(overview.overallStandardization).toBeLessThanOrEqual(100)
  })
})

describe('performance', () => {
  it('analyzes a 100-table synthetic project quickly', async () => {
    const schemas = new Map([
      ['p1', generateLargeSchema('p1', 100)],
      ['p2', generateLargeSchema('p2', 100)],
    ])
    const t0 = Date.now()
    const pairs = computeSimilarities(schemas)
    const matrix = buildSchemaMatrix(schemas, pairs)
    computeOverview(schemas, matrix)
    const elapsed = Date.now() - t0
    expect(elapsed).toBeLessThan(5000)
  })
})
