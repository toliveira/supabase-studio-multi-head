import { useQuery } from '@tanstack/react-query'
import { schemaAnalysisKeys } from './keys'
import type { SchemaMatrix } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getSchemaMatrix(signal?: AbortSignal): Promise<SchemaMatrix> {
  const response = await fetch('/api/schema-analysis/matrix', { signal })
  if (!response.ok) throw new Error(`Failed to fetch matrix: ${response.statusText}`)
  return response.json()
}

export type SchemaMatrixData = Awaited<ReturnType<typeof getSchemaMatrix>>
export type SchemaMatrixError = ResponseError

export const useSchemaMatrixQuery = <TData = SchemaMatrixData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<SchemaMatrixData, SchemaMatrixError, TData> = {}) => {
  return useQuery<SchemaMatrixData, SchemaMatrixError, TData>({
    queryKey: schemaAnalysisKeys.matrix(),
    queryFn: ({ signal }) => getSchemaMatrix(signal),
    enabled,
    staleTime: 60 * 60 * 1000,
    ...options,
  })
}
