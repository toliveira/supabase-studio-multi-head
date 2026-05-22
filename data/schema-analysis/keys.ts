export const schemaAnalysisKeys = {
  analysis: () => ['schema-analysis'] as const,
  matrix: () => ['schema-analysis', 'matrix'] as const,
  recommendations: () => ['schema-analysis', 'recommendations'] as const,
}
