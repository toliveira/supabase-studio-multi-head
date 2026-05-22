import { describe, expect, it } from 'vitest'

import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'
import {
  generateMigration,
  isSafeIdentifier,
  quoteIdent,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { computeSimilarityPairs } from '@/lib/schema-analysis/schema-analyzer'
import type { Recommendation } from '@/lib/schema-analysis/types'

const schemas = new Map(Object.entries(ALL_PROJECTS_SCHEMAS))
const pairs = computeSimilarityPairs(schemas)
const recs = generateRecommendations(schemas, pairs)

describe('identifier safety', () => {
  it('accepts standard names', () => {
    expect(isSafeIdentifier('users')).toBe(true)
    expect(isSafeIdentifier('user_accounts')).toBe(true)
  })

  it('rejects injection attempts', () => {
    expect(isSafeIdentifier('users; DROP TABLE x')).toBe(false)
    expect(isSafeIdentifier('"users"')).toBe(false)
    expect(isSafeIdentifier('')).toBe(false)
  })

  it('quoteIdent throws on unsafe input', () => {
    expect(() => quoteIdent('users; --')).toThrow()
  })
})

describe('validateMigrationScript', () => {
  it('marks empty scripts invalid', () => {
    const r = validateMigrationScript('')
    expect(r.valid).toBe(false)
  })

  it('rejects forbidden statements', () => {
    const r = validateMigrationScript('DROP DATABASE prod;')
    expect(r.valid).toBe(false)
    expect(r.errors.length).toBeGreaterThan(0)
  })

  it('warns on destructive but allowed statements', () => {
    const r = validateMigrationScript('DROP TABLE foo;')
    expect(r.valid).toBe(true)
    expect(r.warnings.length).toBeGreaterThan(0)
  })

  it('accepts a clean rename script', () => {
    const r = validateMigrationScript('ALTER TABLE "users" RENAME TO "user_accounts";')
    expect(r.valid).toBe(true)
    expect(r.errors).toHaveLength(0)
  })
})

describe('generateMigration on real recommendations', () => {
  const renameRec = recs.find((r) => r.type === 'rename_table')!
  const addRec = recs.find((r) => r.type === 'add_missing_table')!
  const columnRec = recs.find((r) => r.type === 'rename_column')!

  it('generates valid SQL for rename_table', () => {
    const m = generateMigration(renameRec)
    expect(m.sql).toContain('ALTER TABLE')
    expect(m.sql).toContain('RENAME TO')
    expect(m.validation.valid).toBe(true)
    expect(m.rollback).toContain('RENAME TO')
  })

  it('generates valid SQL for rename_column', () => {
    const m = generateMigration(columnRec)
    expect(m.sql).toContain('RENAME COLUMN')
    expect(m.validation.valid).toBe(true)
  })

  it('generates CREATE TABLE for add_missing_table', () => {
    const m = generateMigration(addRec)
    expect(m.sql).toContain('CREATE TABLE')
    expect(m.rollback).toContain('DROP TABLE')
    expect(m.validation.valid).toBe(true)
  })

  it('all migrations are wrapped in BEGIN/COMMIT', () => {
    for (const r of recs) {
      const m = generateMigration(r)
      expect(m.sql.trim().startsWith('BEGIN;')).toBe(true)
      expect(m.sql.trim().endsWith('COMMIT;')).toBe(true)
    }
  })

  it('refuses to emit unsafe identifiers', () => {
    const bad: Recommendation = {
      ...renameRec,
      details: { ...renameRec.details, fromTable: 'a"; DROP TABLE x; --', toTable: 'b' },
    }
    expect(() => generateMigration(bad)).toThrow()
  })
})
