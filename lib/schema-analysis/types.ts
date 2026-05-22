export interface ColumnDefinition {
  name: string
  dataType: string
  nullable: boolean
  defaultValue: string | undefined
  constraints: string[]
}

export interface ForeignKeyConstraint {
  name: string
  columns: string[]
  referencedTable: string
  referencedColumns: string[]
}

export interface IndexDefinition {
  name: string
  columns: string[]
  unique: boolean
}

export interface TableSchema {
  projectId: string
  tableName: string
  columns: ColumnDefinition[]
  primaryKey: string[]
  foreignKeys: ForeignKeyConstraint[]
  indexes: IndexDefinition[]
  rowCount: number
  lastUpdated: Date
}

export interface SimilarityBreakdown {
  name: number
  structure: number
  semantic: number
}

export interface SimilarityPair {
  projectA: string
  tableA: string
  projectB: string
  tableB: string
  score: number
  breakdown: SimilarityBreakdown
}

export type RecommendationType =
  | 'rename_table'
  | 'rename_column'
  | 'add_missing_table'
  | 'consolidate_tables'

export type EffortLevel = 'low' | 'medium' | 'high'

export interface Recommendation {
  id: string
  type: RecommendationType
  affectedTables: { projectId: string; tableName: string }[]
  recommendation: string
  rationale: string
  confidence: number
  effort: EffortLevel
  details: Record<string, unknown>
}

export type MatrixCellStatus = 'exact' | 'variant' | 'missing'

export interface MatrixCell {
  projectId: string
  canonicalTable: string
  actualTableName: string | null
  status: MatrixCellStatus
  similarityScore: number
}

export interface SchemaMatrix {
  projects: string[]
  canonicalTables: string[]
  cells: MatrixCell[]
  overallStandardization: number
  perProjectStandardization: Record<string, number>
  generatedAt: string
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface MigrationScript {
  recommendationId: string
  sql: string
  rollback: string
  validation: ValidationResult
  estimatedDurationMs: number
}
