import { describe, expect, it } from 'vitest'

import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'
import { buildMatrix } from '@/lib/schema-analysis/matrix'
import { computeSimilarityPairs } from '@/lib/schema-analysis/schema-analyzer'

const schemas = new Map(Object.entries(ALL_PROJECTS_SCHEMAS))
const pairs = computeSimilarityPairs(schemas)
const matrix = buildMatrix(schemas, pairs)

describe('buildMatrix', () => {
  it('lists all 4 projects', () => {
    expect(matrix.projects).toEqual(['project-a', 'project-b', 'project-c', 'project-d'])
  })

  it('includes the canonical names for every shared table', () => {
    for (const t of ['users', 'products', 'orders', 'audit_log']) {
      expect(matrix.canonicalTables).toContain(t)
    }
  })

  it('marks project-a.users as exact', () => {
    const cell = matrix.cells.find((c) => c.projectId === 'project-a' && c.canonicalTable === 'users')
    expect(cell?.status).toBe('exact')
    expect(cell?.similarityScore).toBe(100)
  })

  it('marks project-b.user_accounts as variant of users', () => {
    const cell = matrix.cells.find((c) => c.projectId === 'project-b' && c.canonicalTable === 'users')
    expect(cell?.status).toBe('variant')
    expect(cell?.actualTableName).toBe('user_accounts')
    expect(cell?.similarityScore).toBeGreaterThanOrEqual(75)
  })

  it('marks project-d.orders as missing', () => {
    const cell = matrix.cells.find((c) => c.projectId === 'project-d' && c.canonicalTable === 'orders')
    expect(cell?.status).toBe('missing')
    expect(cell?.actualTableName).toBeNull()
  })

  it('emits one cell per project x canonical table', () => {
    expect(matrix.cells.length).toBe(matrix.projects.length * matrix.canonicalTables.length)
  })

  it('produces per-project and overall standardization percentages in [0,100]', () => {
    expect(matrix.overallStandardization).toBeGreaterThanOrEqual(0)
    expect(matrix.overallStandardization).toBeLessThanOrEqual(100)
    for (const v of Object.values(matrix.perProjectStandardization)) {
      expect(v).toBeGreaterThanOrEqual(0)
      expect(v).toBeLessThanOrEqual(100)
    }
  })
})
