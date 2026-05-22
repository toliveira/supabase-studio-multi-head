import { beforeEach, describe, expect, it } from 'vitest'

import {
  ALL_PROJECTS_SCHEMAS,
  PROJECT_A_SCHEMA,
} from '@/lib/schema-analysis/__mocks__/data'
import {
  analyzeSchemas,
  buildSchemaMatrix,
  cacheSchemaSnapshot,
  calculateStandardizationScore,
  clearSchemaCache,
  getCachedSchema,
} from '@/lib/schema-analysis/schema-analyzer'

describe('schema-analyzer', () => {
  beforeEach(() => {
    clearSchemaCache()
  })

  describe('cacheSchemaSnapshot / getCachedSchema / clearSchemaCache', () => {
    it('stores and retrieves a cached schema snapshot', () => {
      cacheSchemaSnapshot('project-a', PROJECT_A_SCHEMA)
      const cached = getCachedSchema('project-a')
      expect(cached).not.toBeNull()
      expect(cached).toEqual(PROJECT_A_SCHEMA)
    })

    it('returns null for a project that has not been cached', () => {
      expect(getCachedSchema('does-not-exist')).toBeNull()
    })

    it('clearSchemaCache removes all cached schemas', () => {
      cacheSchemaSnapshot('project-a', PROJECT_A_SCHEMA)
      cacheSchemaSnapshot('project-b', PROJECT_A_SCHEMA)
      clearSchemaCache()
      expect(getCachedSchema('project-a')).toBeNull()
      expect(getCachedSchema('project-b')).toBeNull()
    })

    it('returns null for an expired cache entry (older than 1 hour)', () => {
      const originalNow = Date.now
      const fakeNow = 1_000_000_000_000
      Date.now = () => fakeNow
      try {
        cacheSchemaSnapshot('project-a', PROJECT_A_SCHEMA)
        // jump forward > 1 hour
        Date.now = () => fakeNow + 60 * 60 * 1000 + 1
        expect(getCachedSchema('project-a')).toBeNull()
      } finally {
        Date.now = originalNow
      }
    })
  })

  describe('analyzeSchemas', () => {
    it('returns at least one cross-project similarity pair (score >= 50)', () => {
      const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      expect(result.similarities.length).toBeGreaterThan(0)
      for (const pair of result.similarities) {
        expect(pair.score).toBeGreaterThanOrEqual(50)
        expect(pair.table1.projectId).not.toBe(pair.table2.projectId)
      }
    })

    it('sorts similarity pairs by score descending', () => {
      const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      for (let i = 1; i < result.similarities.length; i++) {
        expect(result.similarities[i - 1].score).toBeGreaterThanOrEqual(
          result.similarities[i].score
        )
      }
    })

    it('detects users vs user_accounts as similar (>75)', () => {
      const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      const match = result.similarities.find(
        (p) =>
          (p.table1.tableName === 'users' && p.table2.tableName === 'user_accounts') ||
          (p.table1.tableName === 'user_accounts' && p.table2.tableName === 'users')
      )
      expect(match).toBeDefined()
      expect(match!.score).toBeGreaterThan(75)
    })

    it('reports totalProjects=4 and a valid analyzedAt timestamp', () => {
      const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      expect(result.totalProjects).toBe(4)
      expect(typeof result.analyzedAt).toBe('string')
      expect(Number.isFinite(Date.parse(result.analyzedAt))).toBe(true)
    })

    it('returns matrix and standardization score in the result', () => {
      const result = analyzeSchemas(ALL_PROJECTS_SCHEMAS)
      expect(result.matrix).toBeDefined()
      expect(result.matrix.projectIds).toEqual([
        'project-a',
        'project-b',
        'project-c',
        'project-d',
      ])
      expect(result.standardizationScore).toBeGreaterThanOrEqual(0)
      expect(result.standardizationScore).toBeLessThanOrEqual(100)
    })
  })

  describe('buildSchemaMatrix', () => {
    it('exposes projectIds in the order of the input record', () => {
      const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
      expect(matrix.projectIds).toEqual([
        'project-a',
        'project-b',
        'project-c',
        'project-d',
      ])
    })

    it('produces rows for users, products, orders, audit_log and notifications', () => {
      const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
      const names = matrix.rows.map((r) => r.canonicalName)
      for (const expected of ['users', 'products', 'orders', 'audit_log', 'notifications']) {
        expect(names).toContain(expected)
      }
    })

    it('users row: project-a exists, project-b has variant user_accounts with score >75', () => {
      const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
      const usersRow = matrix.rows.find((r) => r.canonicalName === 'users')
      expect(usersRow).toBeDefined()

      const a = usersRow!.cells['project-a']
      expect(a.exists).toBe(true)
      expect(a.tableName).toBeNull()

      const b = usersRow!.cells['project-b']
      expect(b.exists).toBe(true)
      expect(b.tableName).toBe('user_accounts')
      expect(b.similarityScore).not.toBeNull()
      expect(b.similarityScore!).toBeGreaterThan(75)
    })

    it('orders row: project-c and project-d are missing', () => {
      const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
      const ordersRow = matrix.rows.find((r) => r.canonicalName === 'orders')
      expect(ordersRow).toBeDefined()
      expect(ordersRow!.cells['project-c'].exists).toBe(false)
      expect(ordersRow!.cells['project-d'].exists).toBe(false)
    })
  })

  describe('calculateStandardizationScore', () => {
    it('returns a value between 0 and 100 for the mock dataset', () => {
      const score = calculateStandardizationScore(ALL_PROJECTS_SCHEMAS)
      expect(score).toBeGreaterThanOrEqual(0)
      expect(score).toBeLessThanOrEqual(100)
    })

    it('returns 100 for identical schemas across projects', () => {
      const identical = {
        'project-a': PROJECT_A_SCHEMA.map((t) => ({ ...t, projectId: 'project-a' })),
        'project-b': PROJECT_A_SCHEMA.map((t) => ({ ...t, projectId: 'project-b' })),
        'project-c': PROJECT_A_SCHEMA.map((t) => ({ ...t, projectId: 'project-c' })),
      }
      expect(calculateStandardizationScore(identical)).toBe(100)
    })
  })
})
