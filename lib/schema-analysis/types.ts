// lib/schema-analysis/types.ts

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

export type SimilarityClassification = 'exact' | 'likely_similar' | 'partial' | 'different'

export interface SimilarityBreakdown {
  name: number
  structure: number
  semantic: number
}

export interface SimilarityPair {
  table1: { projectId: string; tableName: string }
  table2: { projectId: string; tableName: string }
  score: number
  breakdown: SimilarityBreakdown
  classification: SimilarityClassification
}

export type RecommendationType = 'rename' | 'add_table' | 'columns' | 'consolidate'
export type EffortLevel = 'low' | 'medium' | 'high'

export interface ColumnMapping {
  from: string
  to: string
}

export interface Recommendation {
  id: string
  type: RecommendationType
  title: string
  description: string
  confidence: number
  effort: EffortLevel
  affectedProjects: string[]
  baselineProject: string
  affectedTables: string[]
  columnMappings?: ColumnMapping[]
}

export interface MatrixCell {
  exists: boolean
  tableName: string | null
  similarityScore: number | null
  classification: SimilarityClassification | null
}

export interface MatrixRow {
  canonicalName: string
  cells: Record<string, MatrixCell>
}

export interface SchemaMatrix {
  projectIds: string[]
  rows: MatrixRow[]
}

export interface AnalysisResult {
  similarities: SimilarityPair[]
  matrix: SchemaMatrix
  standardizationScore: number
  totalProjects: number
  uniqueTables: number
  similarPairsCount: number
  analyzedAt: string
}

export interface MigrationScript {
  sql: string
  rollbackSql: string
  targetProject: string
  operations: string[]
  estimatedRowsAffected: number
  fkUpdatesRequired: number
}

export interface MigrationValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface ApplyMigrationResult {
  success: boolean
  dryRun: boolean
  message: string
  executionTimeMs?: number
}
