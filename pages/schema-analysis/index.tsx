import { useQuery, useQueryClient } from '@tanstack/react-query'
import Head from 'next/head'
import { useCallback } from 'react'

import { SchemaAnalysisDashboard } from '@/components/schema-analysis/SchemaAnalysisDashboard'
import type {
  MigrationScript,
  Recommendation,
  SchemaMatrix as SchemaMatrixData,
} from '@/lib/schema-analysis/types'
import type { NextPageWithLayout } from '@/types'

interface AnalysisResponse {
  generatedAt: string
  durationMs: number
  projectCount: number
  tableCount: number
  similarPairs: number
}

interface RecommendationsResponse {
  generatedAt: string
  recommendations: Recommendation[]
}

interface MigrationResponse {
  recommendation: Recommendation
  migration: MigrationScript
}

interface ApplyResponse {
  status: string
  message?: string
}

const SchemaAnalysisPage: NextPageWithLayout = () => {
  const queryClient = useQueryClient()

  const analysisQuery = useQuery<AnalysisResponse>({
    queryKey: ['schema-analysis', 'analyze'],
    queryFn: async () => {
      const res = await fetch('/api/schema-analysis/analyze')
      if (!res.ok) throw new Error('Failed to run analysis')
      return res.json()
    },
  })

  const matrixQuery = useQuery<SchemaMatrixData>({
    queryKey: ['schema-analysis', 'matrix'],
    queryFn: async () => {
      const res = await fetch('/api/schema-analysis/matrix')
      if (!res.ok) throw new Error('Failed to load matrix')
      return res.json()
    },
  })

  const recsQuery = useQuery<RecommendationsResponse>({
    queryKey: ['schema-analysis', 'recommendations'],
    queryFn: async () => {
      const res = await fetch('/api/schema-analysis/recommendations')
      if (!res.ok) throw new Error('Failed to load recommendations')
      return res.json()
    },
  })

  const onGenerateMigration = useCallback(async (rec: Recommendation): Promise<MigrationResponse> => {
    const res = await fetch('/api/schema-analysis/generate-migration', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recommendationId: rec.id }),
    })
    if (!res.ok) throw new Error('Failed to generate migration')
    return res.json()
  }, [])

  const onApplyMigration = useCallback(
    async (rec: Recommendation, dryRun: boolean): Promise<ApplyResponse> => {
      const res = await fetch('/api/schema-analysis/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: rec.id, dryRun, confirm: !dryRun }),
      })
      const data = (await res.json()) as ApplyResponse
      return data
    },
    []
  )

  const refresh = useCallback(() => {
    queryClient.invalidateQueries({ queryKey: ['schema-analysis'] })
  }, [queryClient])

  const isLoading = analysisQuery.isPending || matrixQuery.isPending || recsQuery.isPending
  const error = analysisQuery.error ?? matrixQuery.error ?? recsQuery.error

  return (
    <>
      <Head>
        <title>Schema Analysis · Supabase Studio</title>
      </Head>
      {isLoading ? (
        <div className="p-6 text-sm text-foreground-light">Running analysis…</div>
      ) : error ? (
        <div className="p-6 text-sm text-destructive-700">
          {error instanceof Error ? error.message : 'Failed to load schema analysis'}
        </div>
      ) : analysisQuery.data && matrixQuery.data && recsQuery.data ? (
        <SchemaAnalysisDashboard
          matrix={matrixQuery.data}
          recommendations={recsQuery.data.recommendations}
          analysis={analysisQuery.data}
          onGenerateMigration={onGenerateMigration}
          onApplyMigration={onApplyMigration}
          onRefresh={refresh}
          refreshing={analysisQuery.isFetching || matrixQuery.isFetching || recsQuery.isFetching}
        />
      ) : null}
    </>
  )
}

export default SchemaAnalysisPage
