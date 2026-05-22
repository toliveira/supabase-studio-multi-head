import type { MigrationScript, Recommendation, TableSchema, ValidationResult } from './types'

const SAFE_IDENT = /^[a-z_][a-z0-9_]{0,62}$/i

export function isSafeIdentifier(name: string): boolean {
  return SAFE_IDENT.test(name)
}

export function quoteIdent(name: string): string {
  if (!isSafeIdentifier(name)) {
    throw new Error(`Unsafe identifier: ${name}`)
  }
  return `"${name}"`
}

function durationForRowCount(rowCount: number): number {
  // crude estimate: 1ms / 100 rows + 200ms overhead
  return Math.round(200 + rowCount / 100)
}

function renderColumn(col: TableSchema['columns'][number]): string {
  const parts = [quoteIdent(col.name), col.dataType]
  if (!col.nullable) parts.push('NOT NULL')
  if (col.defaultValue !== undefined) parts.push(`DEFAULT ${col.defaultValue}`)
  return parts.join(' ')
}

function generateRenameTable(rec: Recommendation): { sql: string; rollback: string; estimate: number } {
  const fromTable = String(rec.details.fromTable)
  const toTable = String(rec.details.toTable)
  const sql = `ALTER TABLE ${quoteIdent(fromTable)} RENAME TO ${quoteIdent(toTable)};`
  const rollback = `ALTER TABLE ${quoteIdent(toTable)} RENAME TO ${quoteIdent(fromTable)};`
  return { sql, rollback, estimate: 250 }
}

function generateRenameColumn(rec: Recommendation): { sql: string; rollback: string; estimate: number } {
  const tableName = rec.affectedTables[0].tableName
  const fromCol = String(rec.details.fromColumn)
  const toCol = String(rec.details.toColumn)
  const sql = `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(fromCol)} TO ${quoteIdent(toCol)};`
  const rollback = `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(toCol)} TO ${quoteIdent(fromCol)};`
  return { sql, rollback, estimate: 250 }
}

function generateAddMissingTable(rec: Recommendation): { sql: string; rollback: string; estimate: number } {
  const tableName = String(rec.details.tableName)
  const reference = rec.details.referenceSchema as TableSchema | undefined
  if (!reference) {
    return {
      sql: `-- Could not generate CREATE TABLE: missing reference schema.\n-- Manually create ${quoteIdent(tableName)} to match the canonical definition.`,
      rollback: `-- No rollback: creation was skipped.`,
      estimate: 0,
    }
  }
  const cols = reference.columns.map(renderColumn).join(',\n  ')
  const pk =
    reference.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${reference.primaryKey.map(quoteIdent).join(', ')})`
      : ''
  const sql = `CREATE TABLE IF NOT EXISTS ${quoteIdent(tableName)} (\n  ${cols}${pk}\n);`
  const rollback = `DROP TABLE IF EXISTS ${quoteIdent(tableName)};`
  return { sql, rollback, estimate: durationForRowCount(0) }
}

function generateConsolidate(rec: Recommendation): { sql: string; rollback: string; estimate: number } {
  const tableName = String(rec.details.tableName)
  const projects = (rec.details.projects as string[]) ?? []
  const noteLines = [
    `-- Consolidation plan for "${tableName}" across projects: ${projects.join(', ')}`,
    `-- Manual review required. Suggested steps:`,
    `--   1. Pick a canonical column set and types`,
    `--   2. Run ALTER TABLE statements per project to align columns/types`,
    `--   3. Backfill any new columns`,
    `--   4. Add constraints/indexes to match`,
    `-- This generator emits a no-op so nothing is executed without review.`,
    `SELECT 1;`,
  ]
  return { sql: noteLines.join('\n'), rollback: `SELECT 1;`, estimate: 0 }
}

export function generateMigrationScript(recommendation: Recommendation): string {
  return buildScript(recommendation).sql
}

export function generateRollbackScript(_migrationScript: string): string {
  // Kept for API parity, but the meaningful rollback is produced from the recommendation directly.
  return `-- Rollback is generated from the recommendation. See MigrationScript.rollback.`
}

function buildScript(rec: Recommendation): MigrationScript {
  let parts: { sql: string; rollback: string; estimate: number }
  switch (rec.type) {
    case 'rename_table':
      parts = generateRenameTable(rec)
      break
    case 'rename_column':
      parts = generateRenameColumn(rec)
      break
    case 'add_missing_table':
      parts = generateAddMissingTable(rec)
      break
    case 'consolidate_tables':
      parts = generateConsolidate(rec)
      break
    default: {
      const _exhaustive: never = rec.type
      throw new Error(`Unhandled recommendation type: ${String(_exhaustive)}`)
    }
  }

  const wrappedSql = `BEGIN;\n${parts.sql}\nCOMMIT;\n`
  const wrappedRollback = `BEGIN;\n${parts.rollback}\nCOMMIT;\n`
  const validation = validateMigrationScript(parts.sql)

  return {
    recommendationId: rec.id,
    sql: wrappedSql,
    rollback: wrappedRollback,
    validation,
    estimatedDurationMs: parts.estimate,
  }
}

export function generateMigration(rec: Recommendation): MigrationScript {
  return buildScript(rec)
}

const FORBIDDEN_KEYWORDS = [
  /\bDROP\s+DATABASE\b/i,
  /\bTRUNCATE\b/i,
  /\bDELETE\s+FROM\b/i,
  /\bGRANT\b/i,
  /\bREVOKE\b/i,
]

const WARN_KEYWORDS = [/\bDROP\s+TABLE\b/i, /\bDROP\s+COLUMN\b/i]

export function validateMigrationScript(script: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (script.trim().length === 0) {
    errors.push('Migration script is empty.')
  }

  for (const pattern of FORBIDDEN_KEYWORDS) {
    if (pattern.test(script)) errors.push(`Forbidden statement detected: ${pattern.source}`)
  }
  for (const pattern of WARN_KEYWORDS) {
    if (pattern.test(script)) warnings.push(`Destructive statement detected: ${pattern.source}`)
  }

  // Identifier sanity: quoted identifiers should not contain semicolons
  const quoted = script.match(/"[^"]*"/g) ?? []
  for (const q of quoted) {
    const inner = q.slice(1, -1)
    if (inner.includes(';') || inner.includes('"')) {
      errors.push(`Quoted identifier contains invalid characters: ${q}`)
    }
  }

  return { valid: errors.length === 0, errors, warnings }
}
