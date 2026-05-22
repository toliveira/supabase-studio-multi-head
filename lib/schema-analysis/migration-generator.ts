import type {
  ColumnDefinition,
  MigrationScript,
  Recommendation,
  TableSchema,
  ValidationResult,
} from './types'

const SAFE_IDENT = /^[A-Za-z_][A-Za-z0-9_]{0,62}$/

export function isSafeIdentifier(value: unknown): value is string {
  return typeof value === 'string' && SAFE_IDENT.test(value)
}

function quoteIdent(value: string): string {
  if (!isSafeIdentifier(value)) {
    throw new Error(`Unsafe identifier: ${String(value)}`)
  }
  return `"${value}"`
}

function quoteDataType(value: string): string {
  // Allow letters, digits, parens, commas, spaces — disallow quotes/semicolons
  if (!/^[A-Za-z0-9_()\s,]+$/.test(value)) {
    throw new Error(`Unsafe data type: ${value}`)
  }
  return value
}

function columnDefinitionToSql(col: ColumnDefinition): string {
  const parts: string[] = [quoteIdent(col.name), quoteDataType(col.dataType)]
  if (!col.nullable) parts.push('NOT NULL')
  if (col.defaultValue !== undefined) {
    // defaultValue is trusted to be a server-side expression like "now()" or a quoted literal
    parts.push(`DEFAULT ${col.defaultValue}`)
  }
  for (const constraint of col.constraints) {
    if (constraint === 'UNIQUE') parts.push('UNIQUE')
    // PRIMARY KEY and FOREIGN KEY are added at table level
  }
  return parts.join(' ')
}

function generateRenameTableUp(
  projectId: string,
  fromTable: string,
  toTable: string
): string {
  void projectId
  return `ALTER TABLE ${quoteIdent(fromTable)} RENAME TO ${quoteIdent(toTable)};`
}

function generateRenameTableDown(
  projectId: string,
  fromTable: string,
  toTable: string
): string {
  void projectId
  return `ALTER TABLE ${quoteIdent(toTable)} RENAME TO ${quoteIdent(fromTable)};`
}

function generateRenameColumnUp(
  tableName: string,
  fromColumn: string,
  toColumn: string
): string {
  return `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(fromColumn)} TO ${quoteIdent(toColumn)};`
}

function generateRenameColumnDown(
  tableName: string,
  fromColumn: string,
  toColumn: string
): string {
  return `ALTER TABLE ${quoteIdent(tableName)} RENAME COLUMN ${quoteIdent(toColumn)} TO ${quoteIdent(fromColumn)};`
}

function generateCreateTableUp(tableName: string, template: TableSchema): string {
  const columnLines = template.columns.map((c) => `  ${columnDefinitionToSql(c)}`)
  const pkLine =
    template.primaryKey.length > 0
      ? `,\n  PRIMARY KEY (${template.primaryKey.map(quoteIdent).join(', ')})`
      : ''
  return `CREATE TABLE ${quoteIdent(tableName)} (\n${columnLines.join(',\n')}${pkLine}\n);`
}

function generateCreateTableDown(tableName: string): string {
  return `DROP TABLE IF EXISTS ${quoteIdent(tableName)};`
}

export function generateMigrationScript(recommendation: Recommendation): string {
  switch (recommendation.type) {
    case 'rename_table': {
      const target = recommendation.affectedTables[0]
      const canonical = recommendation.metadata?.canonicalName as string | undefined
      if (!target || !canonical) throw new Error('Missing rename target')
      return generateRenameTableUp(target.projectId, target.tableName, canonical)
    }
    case 'rename_column': {
      const target = recommendation.affectedTables[0]
      const fromColumn = recommendation.metadata?.fromColumn as string | undefined
      const toColumn = recommendation.metadata?.toColumn as string | undefined
      if (!target || !fromColumn || !toColumn) {
        throw new Error('Missing column rename metadata')
      }
      return generateRenameColumnUp(target.tableName, fromColumn, toColumn)
    }
    case 'add_missing_table': {
      const target = recommendation.affectedTables[0]
      const template = recommendation.metadata?.templateSchema as TableSchema | undefined
      if (!target || !template) throw new Error('Missing add_missing_table metadata')
      return generateCreateTableUp(target.tableName, template)
    }
    case 'consolidate_tables': {
      const targets = recommendation.affectedTables
      // Consolidation requires manual review — emit a guarded placeholder
      return `-- MANUAL REVIEW REQUIRED: consolidation of ${targets
        .map((t) => quoteIdent(t.tableName))
        .join(' and ')} cannot be auto-generated safely.\n-- Inspect both tables and write a custom migration.`
    }
    case 'standardize_column': {
      return `-- MANUAL REVIEW REQUIRED: column standardization for ${recommendation.title}`
    }
    default:
      throw new Error(`Unsupported recommendation type: ${recommendation.type}`)
  }
}

export function generateRollbackScript(recommendation: Recommendation): string {
  switch (recommendation.type) {
    case 'rename_table': {
      const target = recommendation.affectedTables[0]
      const canonical = recommendation.metadata?.canonicalName as string | undefined
      if (!target || !canonical) throw new Error('Missing rename target')
      return generateRenameTableDown(target.projectId, target.tableName, canonical)
    }
    case 'rename_column': {
      const target = recommendation.affectedTables[0]
      const fromColumn = recommendation.metadata?.fromColumn as string | undefined
      const toColumn = recommendation.metadata?.toColumn as string | undefined
      if (!target || !fromColumn || !toColumn) {
        throw new Error('Missing column rename metadata')
      }
      return generateRenameColumnDown(target.tableName, fromColumn, toColumn)
    }
    case 'add_missing_table': {
      const target = recommendation.affectedTables[0]
      if (!target) throw new Error('Missing target')
      return generateCreateTableDown(target.tableName)
    }
    case 'consolidate_tables':
    case 'standardize_column':
      return '-- No automated rollback available; restore from backup if needed.'
    default:
      throw new Error(`Unsupported recommendation type: ${recommendation.type}`)
  }
}

export function validateMigrationScript(script: string): ValidationResult {
  const errors: string[] = []
  const warnings: string[] = []

  if (!script || script.trim().length === 0) {
    errors.push('Migration script is empty.')
    return { valid: false, errors, warnings }
  }

  // Reject obvious injection / multi-statement misuse
  const commentStripped = script
    .split('\n')
    .filter((line) => !line.trim().startsWith('--'))
    .join('\n')

  const dangerous = [
    /\bDROP\s+SCHEMA\b/i,
    /\bDROP\s+DATABASE\b/i,
    /\bTRUNCATE\b/i,
    /\bGRANT\b/i,
    /\bREVOKE\b/i,
  ]
  for (const pattern of dangerous) {
    if (pattern.test(commentStripped)) {
      errors.push(`Dangerous statement detected: ${pattern.source}`)
    }
  }

  // Basic shape check: must end with ;
  if (commentStripped.trim().length > 0 && !commentStripped.trim().endsWith(';')) {
    warnings.push('Statement does not terminate with a semicolon.')
  }

  return { valid: errors.length === 0, errors, warnings }
}

export function estimateDuration(recommendation: Recommendation): string {
  if (recommendation.effort === 'high') return '> 30 seconds (table rewrite likely)'
  if (recommendation.effort === 'medium') return '~5-30 seconds'
  return '< 1 second'
}

export function buildMigration(recommendation: Recommendation): MigrationScript {
  const upScript = generateMigrationScript(recommendation)
  const downScript = generateRollbackScript(recommendation)
  const validation = validateMigrationScript(upScript)
  return {
    recommendationId: recommendation.id,
    upScript,
    downScript,
    estimatedDuration: estimateDuration(recommendation),
    validation,
  }
}
