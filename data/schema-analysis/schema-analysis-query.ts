import { useQuery } from '@tanstack/react-query'
import { schemaAnalysisKeys } from './keys'
import type { AnalysisResult } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getSchemaAnalysis(signal?: AbortSignal): Promise<AnalysisResult> {
  const response = await fetch('/api/schema-analysis/analyze', { signal })
  if (!response.ok) throw new Error(`Failed to fetch analysis: ${response.statusText}`)
  return response.json()
}

export type SchemaAnalysisData = Awaited<ReturnType<typeof getSchemaAnalysis>>
export type SchemaAnalysisError = ResponseError

export const useSchemaAnalysisQuery = <TData = SchemaAnalysisData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<SchemaAnalysisData, SchemaAnalysisError, TData> = {}) => {
  return useQuery<SchemaAnalysisData, SchemaAnalysisError, TData>({
    queryKey: schemaAnalysisKeys.analysis(),
    queryFn: ({ signal }) => getSchemaAnalysis(signal),
    enabled,
    staleTime: 60 * 60 * 1000,
    ...options,
  })
}
