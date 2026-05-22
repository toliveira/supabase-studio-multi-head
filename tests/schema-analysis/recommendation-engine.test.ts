import { describe, expect, it } from 'vitest'

import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { computeSimilarityPairs } from '@/lib/schema-analysis/schema-analyzer'

const schemas = new Map(Object.entries(ALL_PROJECTS_SCHEMAS))
const pairs = computeSimilarityPairs(schemas)
const recs = generateRecommendations(schemas, pairs)

describe('generateRecommendations on mock data', () => {
  it('produces at least one recommendation of each major type', () => {
    const types = new Set(recs.map((r) => r.type))
    expect(types.has('rename_table')).toBe(true)
    expect(types.has('rename_column')).toBe(true)
    expect(types.has('add_missing_table')).toBe(true)
  })

  it('recommends renaming user_accounts -> users', () => {
    const found = recs.find(
      (r) =>
        r.type === 'rename_table' &&
        r.affectedTables.some((a) => a.projectId === 'project-b' && a.tableName === 'user_accounts')
    )
    expect(found).toBeDefined()
    expect(found!.details).toMatchObject({ toTable: 'users' })
  })

  it('recommends renaming items -> products', () => {
    const found = recs.find(
      (r) =>
        r.type === 'rename_table' &&
        r.affectedTables.some((a) => a.projectId === 'project-b' && a.tableName === 'items')
    )
    expect(found).toBeDefined()
    expect(found!.details).toMatchObject({ toTable: 'products' })
  })

  it('recommends adding the missing orders table where appropriate', () => {
    const additions = recs.filter((r) => r.type === 'add_missing_table')
    expect(additions.length).toBeGreaterThan(0)
  })

  it('recommends column renames for the variant schema (email_address -> email)', () => {
    const found = recs.find(
      (r) =>
        r.type === 'rename_column' &&
        r.affectedTables[0].projectId === 'project-b' &&
        r.details.toColumn === 'email'
    )
    expect(found).toBeDefined()
  })

  it('every recommendation has confidence in [0,1] and a valid effort', () => {
    for (const r of recs) {
      expect(r.confidence).toBeGreaterThanOrEqual(0)
      expect(r.confidence).toBeLessThanOrEqual(1)
      expect(['low', 'medium', 'high']).toContain(r.effort)
      expect(r.recommendation.length).toBeGreaterThan(0)
    }
  })

  it('returns recommendations sorted by descending confidence', () => {
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].confidence).toBeGreaterThanOrEqual(recs[i].confidence)
    }
  })

  it('does not produce duplicate recommendation ids', () => {
    const ids = recs.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
