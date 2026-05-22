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
  | 'standardize_column'

export type EffortLevel = 'low' | 'medium' | 'high'

export interface RecommendationAffectedTable {
  projectId: string
  tableName: string
}

export interface Recommendation {
  id: string
  type: RecommendationType
  title: string
  recommendation: string
  affectedTables: RecommendationAffectedTable[]
  confidence: number
  effort: EffortLevel
  priority: number
  metadata?: Record<string, unknown>
}

export interface MatrixCell {
  exists: boolean
  variantName?: string
  similarityScore?: number
}

export interface SchemaMatrix {
  projects: string[]
  canonicalTables: string[]
  cells: Record<string, Record<string, MatrixCell>>
  similarities: SimilarityPair[]
}

export interface ValidationResult {
  valid: boolean
  errors: string[]
  warnings: string[]
}

export interface MigrationScript {
  recommendationId: string
  upScript: string
  downScript: string
  estimatedDuration: string
  validation: ValidationResult
}

export interface ProjectStandardization {
  projectId: string
  standardizationScore: number
  totalTables: number
  matchingTables: number
  pendingMigrations: number
}

export interface AnalysisOverview {
  overallStandardization: number
  totalProjects: number
  totalTables: number
  similarTablePairs: number
  lastSyncAt: string
  perProject: ProjectStandardization[]
}
