import { describe, expect, it } from 'vitest'

import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import {
  computeSimilarities,
  getAllProjectsSchemas,
} from '@/lib/schema-analysis/schema-analyzer'

describe('generateRecommendations', () => {
  it('produces a non-empty prioritized list from mock data', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    expect(recs.length).toBeGreaterThan(0)
    for (let i = 1; i < recs.length; i++) {
      expect(recs[i - 1].priority).toBeLessThanOrEqual(recs[i].priority)
    }
  })

  it('includes at least one rename_table recommendation', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    expect(recs.some((r) => r.type === 'rename_table')).toBe(true)
  })

  it('includes at least one add_missing_table recommendation for project-d', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    const missingForD = recs.filter(
      (r) =>
        r.type === 'add_missing_table' &&
        r.affectedTables.some((t) => t.projectId === 'project-d')
    )
    expect(missingForD.length).toBeGreaterThan(0)
  })

  it('confidence is always within [0.7, 1]', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    for (const r of recs) {
      expect(r.confidence).toBeGreaterThanOrEqual(0.7)
      expect(r.confidence).toBeLessThanOrEqual(1)
      expect(['low', 'medium', 'high']).toContain(r.effort)
    }
  })

  it('emits unique recommendation ids', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    const ids = recs.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })
})
