import { beforeAll, beforeEach, describe, expect, it } from 'vitest'

import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'
import {
  generateRecommendations,
  resetIdCounter,
} from '@/lib/schema-analysis/recommendation-engine'
import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import type { Recommendation } from '@/lib/schema-analysis/types'

describe('recommendation-engine', () => {
  let recommendations: Recommendation[]

  beforeAll(() => {
    resetIdCounter()
    const analysis = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
    recommendations = generateRecommendations(
      ALL_PROJECTS_SCHEMAS,
      analysis.similarities
    )
  })

  it('generates at least one recommendation', () => {
    expect(recommendations.length).toBeGreaterThan(0)
  })

  it('has a rename recommendation for user_accounts → users', () => {
    const rec = recommendations.find(
      (r) =>
        r.type === 'rename' &&
        r.affectedTables.includes('user_accounts') &&
        r.affectedProjects.includes('project-b')
    )
    expect(rec).toBeDefined()
    expect(rec!.confidence).toBeGreaterThanOrEqual(0.7)
    expect(rec!.confidence).toBeLessThanOrEqual(1.0)
  })

  it('has a rename recommendation for items → products', () => {
    const rec = recommendations.find(
      (r) =>
        r.type === 'rename' &&
        r.affectedTables.includes('items') &&
        r.affectedProjects.includes('project-b')
    )
    expect(rec).toBeDefined()
  })

  it('has an add_table recommendation for orders covering project-c and project-d', () => {
    const rec = recommendations.find(
      (r) => r.type === 'add_table' && r.affectedTables.includes('orders')
    )
    expect(rec).toBeDefined()
    expect(rec!.affectedProjects).toEqual(
      expect.arrayContaining(['project-c', 'project-d'])
    )
  })

  it('has a columns recommendation with non-empty columnMappings', () => {
    const rec = recommendations.find(
      (r) => r.type === 'columns' && (r.columnMappings?.length ?? 0) > 0
    )
    expect(rec).toBeDefined()
    expect(rec!.columnMappings!.length).toBeGreaterThan(0)
  })

  it('all confidences are in range [0.7, 1.0]', () => {
    for (const rec of recommendations) {
      expect(rec.confidence).toBeGreaterThanOrEqual(0.7)
      expect(rec.confidence).toBeLessThanOrEqual(1.0)
    }
  })

  it('all efforts are low, medium, or high', () => {
    for (const rec of recommendations) {
      expect(['low', 'medium', 'high']).toContain(rec.effort)
    }
  })

  it('recommendations are sorted by confidence descending', () => {
    for (let i = 1; i < recommendations.length; i++) {
      expect(recommendations[i - 1].confidence).toBeGreaterThanOrEqual(
        recommendations[i].confidence
      )
    }
  })

  it('all recommendation ids are unique', () => {
    const ids = recommendations.map((r) => r.id)
    expect(new Set(ids).size).toBe(ids.length)
  })

  describe('resetIdCounter', () => {
    beforeEach(() => {
      resetIdCounter()
    })

    it('restarts ids at rec-1 after reset', () => {
      const analysis = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      const recs = generateRecommendations(
        ALL_PROJECTS_SCHEMAS,
        analysis.similarities
      )
      expect(recs[0].id).toMatch(/^rec-\d+$/)
      const minId = Math.min(...recs.map((r) => parseInt(r.id.split('-')[1], 10)))
      expect(minId).toBe(1)
    })
  })
})
