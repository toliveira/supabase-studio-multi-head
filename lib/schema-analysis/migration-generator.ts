// lib/schema-analysis/migration-generator.ts

import type {
  ColumnMapping,
  MigrationScript,
  MigrationValidationResult,
  Recommendation,
} from './types'

const SAFE_IDENTIFIER = /^[a-zA-Z_][a-zA-Z0-9_]*$/

/**
 * Wraps an identifier in double quotes when it contains characters that
 * would otherwise require quoting in PostgreSQL. Inner quotes are escaped.
 */
export function sanitizeIdentifier(name: string): string {
  if (SAFE_IDENTIFIER.test(name)) {
    return name
  }
  return `"${name.replace(/"/g, '""')}"`
}

/**
 * Best-effort extraction of the new table name from a rename recommendation
 * title. Falls back to the original table name if no match is found.
 */
function extractNewTableName(title: string, fallback: string): string {
  const match = title.match(/to\s+"([^"]+)"/i)
  if (match && match[1]) {
    return match[1]
  }
  return fallback
}

function buildHeader(recommendation: Recommendation, targetProject: string): string {
  const date = new Date().toISOString()
  return [
    `-- Migration: ${recommendation.title}`,
    `-- Recommendation ID: ${recommendation.id}`,
    `-- Target project: ${targetProject}`,
    `-- Generated at: ${date}`,
  ].join('\n')
}

function wrapInTransaction(header: string, body: string[]): string {
  return [header, '', 'BEGIN;', ...body, 'COMMIT;', ''].join('\n')
}

function buildRenameMigration(recommendation: Recommendation): {
  sql: string
  operations: string[]
} {
  const oldTable = recommendation.affectedTables[0]
  const newTable = extractNewTableName(recommendation.title, oldTable)
  const targetProject = recommendation.affectedProjects[0]
  const oldId = sanitizeIdentifier(oldTable)
  const newId = sanitizeIdentifier(newTable)

  const operations: string[] = []
  const body: string[] = []

  body.push(`ALTER TABLE ${oldId} RENAME TO ${newId};`)
  operations.push(`Rename table ${oldTable} -> ${newTable}`)

  const mappings = recommendation.columnMappings ?? []
  for (const mapping of mappings) {
    body.push(
      `ALTER TABLE ${newId} RENAME COLUMN ${sanitizeIdentifier(
        mapping.from
      )} TO ${sanitizeIdentifier(mapping.to)};`
    )
    operations.push(`Rename column ${mapping.from} -> ${mapping.to}`)
  }

  const header = buildHeader(recommendation, targetProject)
  const sql = wrapInTransaction(header, body)
  return { sql, operations }
}

function buildAddTableMigration(recommendation: Recommendation): {
  sql: string
  operations: string[]
} {
  const tableName = recommendation.affectedTables[0]
  const targetProject = recommendation.affectedProjects[0]
  const tableId = sanitizeIdentifier(tableName)

  const body = [
    `CREATE TABLE IF NOT EXISTS ${tableId} (`,
    `  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,`,
    `  created_at timestamptz NOT NULL DEFAULT now(),`,
    `  updated_at timestamptz NOT NULL DEFAULT now()`,
    `);`,
  ]

  const operations = [`Create table ${tableName}`]
  const header = buildHeader(recommendation, targetProject)
  const sql = wrapInTransaction(header, body)
  return { sql, operations }
}

function buildColumnsMigration(recommendation: Recommendation): {
  sql: string
  operations: string[]
} {
  const tableName = recommendation.affectedTables[0]
  const targetProject = recommendation.affectedProjects[0]
  const tableId = sanitizeIdentifier(tableName)

  const operations: string[] = []
  const body: string[] = []

  const mappings = recommendation.columnMappings ?? []
  for (const mapping of mappings) {
    body.push(
      `ALTER TABLE ${tableId} RENAME COLUMN ${sanitizeIdentifier(
        mapping.from
      )} TO ${sanitizeIdentifier(mapping.to)};`
    )
    operations.push(`Rename column ${mapping.from} -> ${mapping.to}`)
  }

  const header = buildHeader(recommendation, targetProject)
  const sql = wrapInTransaction(header, body)
  return { sql, operations }
}

export function generateMigrationScript(recommendation: Recommendation): MigrationScript {
  const targetProject = recommendation.affectedProjects[0] ?? ''

  let sql = ''
  let operations: string[] = []

  switch (recommendation.type) {
    case 'rename': {
      const result = buildRenameMigration(recommendation)
      sql = result.sql
      operations = result.operations
      break
    }
    case 'add_table': {
      const result = buildAddTableMigration(recommendation)
      sql = result.sql
      operations = result.operations
      break
    }
    case 'columns': {
      const result = buildColumnsMigration(recommendation)
      sql = result.sql
      operations = result.operations
      break
    }
    default: {
      const header = buildHeader(recommendation, targetProject)
      sql = wrapInTransaction(header, [
        `-- No migration template available for type "${recommendation.type}"`,
      ])
      operations = []
    }
  }

  const rollbackSql = generateRollbackScript(recommendation)

  return {
    sql,
    rollbackSql,
    targetProject,
    operations,
    estimatedRowsAffected: 0,
    fkUpdatesRequired: 0,
  }
}

function buildRenameRollback(recommendation: Recommendation): string {
  const oldTable = recommendation.affectedTables[0]
  const newTable = extractNewTableName(recommendation.title, oldTable)
  const oldId = sanitizeIdentifier(oldTable)
  const newId = sanitizeIdentifier(newTable)
  const targetProject = recommendation.affectedProjects[0] ?? ''

  const header = [
    `-- Rollback: ${recommendation.title}`,
    `-- Recommendation ID: ${recommendation.id}`,
    `-- Target project: ${targetProject}`,
  ].join('\n')

  const body: string[] = []
  const mappings = [...(recommendation.columnMappings ?? [])].reverse()
  for (const mapping of mappings) {
    body.push(
      `ALTER TABLE ${newId} RENAME COLUMN ${sanitizeIdentifier(
        mapping.to
      )} TO ${sanitizeIdentifier(mapping.from)};`
    )
  }
  body.push(`ALTER TABLE ${newId} RENAME TO ${oldId};`)

  return wrapInTransaction(header, body)
}

function buildAddTableRollback(recommendation: Recommendation): string {
  const tableName = recommendation.affectedTables[0]
  const tableId = sanitizeIdentifier(tableName)
  const targetProject = recommendation.affectedProjects[0] ?? ''

  const header = [
    `-- Rollback: ${recommendation.title}`,
    `-- Recommendation ID: ${recommendation.id}`,
    `-- Target project: ${targetProject}`,
  ].join('\n')

  return wrapInTransaction(header, [`DROP TABLE IF EXISTS ${tableId};`])
}

function buildColumnsRollback(recommendation: Recommendation): string {
  const tableName = recommendation.affectedTables[0]
  const tableId = sanitizeIdentifier(tableName)
  const targetProject = recommendation.affectedProjects[0] ?? ''

  const header = [
    `-- Rollback: ${recommendation.title}`,
    `-- Recommendation ID: ${recommendation.id}`,
    `-- Target project: ${targetProject}`,
  ].join('\n')

  const mappings: ColumnMapping[] = [...(recommendation.columnMappings ?? [])].reverse()
  const body = mappings.map(
    (mapping) =>
      `ALTER TABLE ${tableId} RENAME COLUMN ${sanitizeIdentifier(
        mapping.to
      )} TO ${sanitizeIdentifier(mapping.from)};`
  )

  return wrapInTransaction(header, body)
}

export function generateRollbackScript(recommendation: Recommendation): string {
  switch (recommendation.type) {
    case 'rename':
      return buildRenameRollback(recommendation)
    case 'add_table':
      return buildAddTableRollback(recommendation)
    case 'columns':
      return buildColumnsRollback(recommendation)
    default: {
      const targetProject = recommendation.affectedProjects[0] ?? ''
      const header = [
        `-- Rollback: ${recommendation.title}`,
        `-- Recommendation ID: ${recommendation.id}`,
        `-- Target project: ${targetProject}`,
      ].join('\n')
      return wrapInTransaction(header, [
        `-- No rollback template available for type "${recommendation.type}"`,
      ])
    }
  }
}

const DANGEROUS_PATTERNS: { pattern: RegExp; message: string }[] = [
  { pattern: /\bDROP\s+DATABASE\b/i, message: 'Script contains DROP DATABASE, which is not allowed' },
  { pattern: /\bTRUNCATE\s+TABLE\b/i, message: 'Script contains TRUNCATE TABLE, which is not allowed' },
  { pattern: /\bDROP\s+SCHEMA\b/i, message: 'Script contains DROP SCHEMA, which is not allowed' },
]

export function validateMigrationScript(sql: string): MigrationValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!sql || sql.trim().length === 0) {
    return {
      valid: false,
      errors: ['Migration script is empty'],
      warnings,
    }
  }

  for (const { pattern, message } of DANGEROUS_PATTERNS) {
    if (pattern.test(sql)) {
      errors.push(message)
    }
  }

  const hasBegin = /\bBEGIN\s*;/i.test(sql)
  const hasCommit = /\bCOMMIT\s*;/i.test(sql)
  if (!hasBegin || !hasCommit) {
    warnings.push('Migration is not wrapped in a BEGIN/COMMIT transaction block')
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  }
}
