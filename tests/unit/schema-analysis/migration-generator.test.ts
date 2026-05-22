import { describe, expect, it } from 'vitest'

import {
  buildMigration,
  generateMigrationScript,
  generateRollbackScript,
  isSafeIdentifier,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import {
  computeSimilarities,
  getAllProjectsSchemas,
} from '@/lib/schema-analysis/schema-analyzer'
import type { Recommendation, TableSchema } from '@/lib/schema-analysis/types'

const sampleTable: TableSchema = {
  projectId: 'project-x',
  tableName: 'widgets',
  columns: [
    { name: 'id', dataType: 'bigint', nullable: false, defaultValue: undefined, constraints: ['PRIMARY KEY'] },
    { name: 'name', dataType: 'text', nullable: false, defaultValue: undefined, constraints: [] },
  ],
  primaryKey: ['id'],
  foreignKeys: [],
  indexes: [],
  rowCount: 0,
  lastUpdated: new Date(),
}

describe('isSafeIdentifier', () => {
  it('accepts simple snake_case', () => {
    expect(isSafeIdentifier('users')).toBe(true)
    expect(isSafeIdentifier('user_accounts')).toBe(true)
  })
  it('rejects injection attempts', () => {
    expect(isSafeIdentifier('users; DROP TABLE foo;')).toBe(false)
    expect(isSafeIdentifier('"users"')).toBe(false)
    expect(isSafeIdentifier('1user')).toBe(false)
  })
})

describe('generateMigrationScript / generateRollbackScript', () => {
  it('emits a safe RENAME for rename_table', () => {
    const rec: Recommendation = {
      id: 'r1',
      type: 'rename_table',
      title: 'rename',
      recommendation: 'x',
      affectedTables: [{ projectId: 'project-x', tableName: 'user_accounts' }],
      confidence: 0.9,
      effort: 'low',
      priority: 1,
      metadata: { canonicalName: 'users' },
    }
    expect(generateMigrationScript(rec)).toBe(
      'ALTER TABLE "user_accounts" RENAME TO "users";'
    )
    expect(generateRollbackScript(rec)).toBe(
      'ALTER TABLE "users" RENAME TO "user_accounts";'
    )
  })

  it('emits a safe CREATE TABLE for add_missing_table', () => {
    const rec: Recommendation = {
      id: 'r2',
      type: 'add_missing_table',
      title: 'add',
      recommendation: 'x',
      affectedTables: [{ projectId: 'project-d', tableName: 'widgets' }],
      confidence: 0.8,
      effort: 'medium',
      priority: 2,
      metadata: { templateSchema: sampleTable },
    }
    const sql = generateMigrationScript(rec)
    expect(sql).toContain('CREATE TABLE "widgets"')
    expect(sql).toContain('"id" bigint NOT NULL')
    expect(sql).toContain('PRIMARY KEY ("id")')
    expect(generateRollbackScript(rec)).toBe('DROP TABLE IF EXISTS "widgets";')
  })

  it('throws on unsafe identifiers', () => {
    const rec: Recommendation = {
      id: 'r3',
      type: 'rename_table',
      title: 'bad',
      recommendation: 'x',
      affectedTables: [{ projectId: 'project-x', tableName: 'foo; DROP TABLE bar;' }],
      confidence: 0.9,
      effort: 'low',
      priority: 1,
      metadata: { canonicalName: 'users' },
    }
    expect(() => generateMigrationScript(rec)).toThrow(/Unsafe identifier/)
  })
})

describe('validateMigrationScript', () => {
  it('rejects empty scripts', () => {
    expect(validateMigrationScript('').valid).toBe(false)
  })
  it('rejects DROP SCHEMA', () => {
    expect(validateMigrationScript('DROP SCHEMA public;').valid).toBe(false)
  })
  it('accepts a benign rename', () => {
    const result = validateMigrationScript('ALTER TABLE "a" RENAME TO "b";')
    expect(result.valid).toBe(true)
    expect(result.errors).toEqual([])
  })
  it('warns about missing terminator', () => {
    const result = validateMigrationScript('ALTER TABLE "a" RENAME TO "b"')
    expect(result.warnings.length).toBeGreaterThan(0)
  })
})

describe('buildMigration end-to-end', () => {
  it('produces valid up/down + duration for every generated recommendation', async () => {
    const schemas = await getAllProjectsSchemas()
    const sims = computeSimilarities(schemas)
    const recs = generateRecommendations(schemas, sims)
    expect(recs.length).toBeGreaterThan(0)
    for (const rec of recs) {
      const migration = buildMigration(rec)
      expect(migration.recommendationId).toBe(rec.id)
      expect(migration.upScript.length).toBeGreaterThan(0)
      expect(migration.downScript.length).toBeGreaterThan(0)
      expect(migration.estimatedDuration.length).toBeGreaterThan(0)
    }
  })
})
