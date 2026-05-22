import { useQuery } from '@tanstack/react-query'
import { schemaAnalysisKeys } from './keys'
import type { Recommendation } from '@/lib/schema-analysis/types'
import type { ResponseError, UseCustomQueryOptions } from '@/types'

async function getRecommendations(signal?: AbortSignal): Promise<Recommendation[]> {
  const response = await fetch('/api/schema-analysis/recommendations', { signal })
  if (!response.ok) throw new Error(`Failed to fetch recommendations: ${response.statusText}`)
  return response.json()
}

export type RecommendationsData = Awaited<ReturnType<typeof getRecommendations>>
export type RecommendationsError = ResponseError

export const useRecommendationsQuery = <TData = RecommendationsData>({
  enabled = true,
  ...options
}: UseCustomQueryOptions<RecommendationsData, RecommendationsError, TData> = {}) => {
  return useQuery<RecommendationsData, RecommendationsError, TData>({
    queryKey: schemaAnalysisKeys.recommendations(),
    queryFn: ({ signal }) => getRecommendations(signal),
    enabled,
    staleTime: 60 * 60 * 1000,
    ...options,
  })
}
