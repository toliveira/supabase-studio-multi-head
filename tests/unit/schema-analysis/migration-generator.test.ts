import { describe, expect, it } from 'vitest'

import {
  generateMigrationScript,
  generateRollbackScript,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import type { Recommendation } from '@/lib/schema-analysis/types'

const renameRecommendation: Recommendation = {
  id: 'rec-1',
  type: 'rename',
  title: 'Rename "user_accounts" to "users"',
  description: 'test',
  confidence: 0.92,
  effort: 'medium',
  affectedProjects: ['project-b'],
  baselineProject: 'project-a',
  affectedTables: ['user_accounts'],
  columnMappings: [
    { from: 'user_id', to: 'id' },
    { from: 'email_address', to: 'email' },
    { from: 'account_name', to: 'username' },
    { from: 'created_timestamp', to: 'created_at' },
    { from: 'updated_timestamp', to: 'updated_at' },
  ],
}

const addTableRecommendation: Recommendation = {
  id: 'rec-2',
  type: 'add_table',
  title: 'Add "orders" table',
  description: 'test',
  confidence: 0.85,
  effort: 'high',
  affectedProjects: ['project-c', 'project-d'],
  baselineProject: 'project-a',
  affectedTables: ['orders'],
}

const columnRecommendation: Recommendation = {
  id: 'rec-3',
  type: 'columns',
  title: 'Standardize columns',
  description: 'test',
  confidence: 0.88,
  effort: 'low',
  affectedProjects: ['project-b'],
  baselineProject: 'project-a',
  affectedTables: ['items'],
  columnMappings: [
    { from: 'item_name', to: 'name' },
    { from: 'item_description', to: 'description' },
  ],
}

describe('migration-generator', () => {
  describe('generateMigrationScript', () => {
    it('produces a rename migration with table and column renames', () => {
      const script = generateMigrationScript(renameRecommendation)

      expect(script.sql).toContain('ALTER TABLE')
      expect(script.sql).toContain('RENAME TO')
      expect(script.sql).toContain('user_accounts')
      expect(script.sql).toContain('users')
      expect(script.sql).toContain('RENAME COLUMN')
      expect(script.sql).toContain('email_address')
      expect(script.sql).toContain('email')
      expect(script.sql).toContain('BEGIN')
      expect(script.sql).toContain('COMMIT')
      expect(script.targetProject).toBe('project-b')
      expect(script.operations.length).toBeGreaterThan(0)
    })

    it('produces an add_table migration with CREATE TABLE', () => {
      const script = generateMigrationScript(addTableRecommendation)

      expect(script.sql).toContain('CREATE TABLE')
      expect(script.sql).toContain('orders')
      expect(script.sql).toContain('BEGIN')
      expect(script.sql).toContain('COMMIT')
      expect(script.targetProject).toBe('project-c')
      expect(script.operations.length).toBeGreaterThan(0)
    })

    it('produces a columns migration with column renames', () => {
      const script = generateMigrationScript(columnRecommendation)

      expect(script.sql).toContain('RENAME COLUMN')
      expect(script.sql).toContain('item_name')
      expect(script.sql).toContain('name')
      expect(script.sql).toContain('BEGIN')
      expect(script.sql).toContain('COMMIT')
      expect(script.targetProject).toBe('project-b')
      expect(script.operations.length).toBeGreaterThan(0)
    })

    it('returns MigrationScript with expected shape', () => {
      const script = generateMigrationScript(renameRecommendation)
      expect(script).toHaveProperty('sql')
      expect(script).toHaveProperty('rollbackSql')
      expect(script).toHaveProperty('targetProject')
      expect(script).toHaveProperty('operations')
      expect(script).toHaveProperty('estimatedRowsAffected')
      expect(script).toHaveProperty('fkUpdatesRequired')
      expect(typeof script.estimatedRowsAffected).toBe('number')
      expect(typeof script.fkUpdatesRequired).toBe('number')
    })
  })

  describe('generateRollbackScript', () => {
    it('rolls back a rename by restoring the original names', () => {
      const rollback = generateRollbackScript(renameRecommendation)

      expect(rollback).toContain('ALTER TABLE')
      expect(rollback).toContain('users')
      expect(rollback).toContain('user_accounts')
      expect(rollback).toContain('BEGIN')
      expect(rollback).toContain('COMMIT')
    })

    it('rolls back an add_table by dropping the table', () => {
      const rollback = generateRollbackScript(addTableRecommendation)

      expect(rollback).toContain('DROP TABLE')
      expect(rollback).toContain('orders')
    })

    it('rolls back column renames in reverse', () => {
      const rollback = generateRollbackScript(columnRecommendation)

      expect(rollback).toContain('RENAME COLUMN')
      expect(rollback).toContain('item_name')
      expect(rollback).toContain('name')
    })
  })

  describe('validateMigrationScript', () => {
    it('flags an empty script as invalid', () => {
      const result = validateMigrationScript('')
      expect(result.valid).toBe(false)
      expect(result.errors).toContain('Migration script is empty')
    })

    it('flags DROP DATABASE as invalid', () => {
      const result = validateMigrationScript('BEGIN; DROP DATABASE foo; COMMIT;')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('flags TRUNCATE TABLE as invalid', () => {
      const result = validateMigrationScript('BEGIN; TRUNCATE TABLE foo; COMMIT;')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('flags DROP SCHEMA as invalid', () => {
      const result = validateMigrationScript('BEGIN; DROP SCHEMA public; COMMIT;')
      expect(result.valid).toBe(false)
      expect(result.errors.length).toBeGreaterThan(0)
    })

    it('warns when BEGIN/COMMIT are missing', () => {
      const result = validateMigrationScript('ALTER TABLE foo RENAME TO bar;')
      expect(result.warnings.length).toBeGreaterThan(0)
    })

    it('passes valid migration scripts', () => {
      const script = generateMigrationScript(renameRecommendation)
      const result = validateMigrationScript(script.sql)
      expect(result.valid).toBe(true)
      expect(result.errors).toEqual([])
    })
  })
})
