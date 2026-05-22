import { useCallback, useEffect, useState } from 'react'

import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle } from 'ui'

import type {
  AnalysisOverview,
  MigrationScript,
  Recommendation,
  SchemaMatrix as SchemaMatrixData,
} from '@/lib/schema-analysis/types'

import { MigrationPreview } from './MigrationPreview'
import { ProgressTracker } from './ProgressTracker'
import { RecommendationsPanel } from './RecommendationsPanel'
import { SchemaMatrix } from './SchemaMatrix'

interface DashboardState {
  overview: AnalysisOverview | null
  matrix: SchemaMatrixData | null
  recommendations: Recommendation[]
  loading: boolean
  error: string | null
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init)
  if (!res.ok) {
    const text = await res.text()
    throw new Error(`Request failed (${res.status}): ${text}`)
  }
  return (await res.json()) as T
}

export function SchemaAnalysisDashboard() {
  const [state, setState] = useState<DashboardState>({
    overview: null,
    matrix: null,
    recommendations: [],
    loading: true,
    error: null,
  })

  const [selectedRec, setSelectedRec] = useState<Recommendation | null>(null)
  const [migration, setMigration] = useState<MigrationScript | null>(null)
  const [migrationLoading, setMigrationLoading] = useState(false)
  const [applyResult, setApplyResult] = useState<string | null>(null)

  const runAnalysis = useCallback(async (refresh = false) => {
    setState((prev) => ({ ...prev, loading: true, error: null }))
    try {
      const [analyzeRes, matrixRes, recsRes] = await Promise.all([
        fetchJson<{ overview: AnalysisOverview }>('/api/schema-analysis/analyze', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ refresh }),
        }),
        fetchJson<SchemaMatrixData>('/api/schema-analysis/matrix'),
        fetchJson<{ recommendations: Recommendation[] }>(
          '/api/schema-analysis/recommendations'
        ),
      ])
      setState({
        overview: analyzeRes.overview,
        matrix: matrixRes,
        recommendations: recsRes.recommendations,
        loading: false,
        error: null,
      })
    } catch (err) {
      setState((prev) => ({
        ...prev,
        loading: false,
        error: err instanceof Error ? err.message : 'Unknown error',
      }))
    }
  }, [])

  useEffect(() => {
    runAnalysis(false)
  }, [runAnalysis])

  const handleGenerateMigration = useCallback(async (rec: Recommendation) => {
    setSelectedRec(rec)
    setMigration(null)
    setApplyResult(null)
    setMigrationLoading(true)
    try {
      const result = await fetchJson<{ migration: MigrationScript }>(
        '/api/schema-analysis/generate-migration',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ recommendationId: rec.id }),
        }
      )
      setMigration(result.migration)
    } catch (err) {
      setApplyResult(err instanceof Error ? err.message : 'Failed to generate migration')
    } finally {
      setMigrationLoading(false)
    }
  }, [])

  const handleApply = useCallback(async (rec: Recommendation, dryRun: boolean) => {
    setApplyResult(null)
    try {
      const res = await fetch('/api/schema-analysis/apply-migration', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ recommendationId: rec.id, dryRun }),
      })
      const body = await res.json()
      setApplyResult(JSON.stringify(body, null, 2))
    } catch (err) {
      setApplyResult(err instanceof Error ? err.message : 'Apply failed')
    }
  }, [])

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">Schema Analysis</h1>
          <p className="text-sm text-foreground-light">
            Analyze, compare, and standardize database schemas across all managed projects.
          </p>
        </div>
        <Button
          type="default"
          size="tiny"
          loading={state.loading}
          onClick={() => runAnalysis(true)}
        >
          Refresh
        </Button>
      </div>

      {state.error && (
        <Card>
          <CardContent className="py-4">
            <p className="text-sm text-destructive">{state.error}</p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 gap-4 md:grid-cols-4">
        <Card>
          <CardHeader>
            <CardDescription>Overall standardization</CardDescription>
            <CardTitle className="text-3xl">
              {state.overview?.overallStandardization ?? '—'}%
            </CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total projects</CardDescription>
            <CardTitle className="text-3xl">{state.overview?.totalProjects ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Total tables</CardDescription>
            <CardTitle className="text-3xl">{state.overview?.totalTables ?? '—'}</CardTitle>
          </CardHeader>
        </Card>
        <Card>
          <CardHeader>
            <CardDescription>Similar table pairs</CardDescription>
            <CardTitle className="text-3xl">
              {state.overview?.similarTablePairs ?? '—'}
            </CardTitle>
          </CardHeader>
        </Card>
      </div>

      {state.overview && (
        <p className="text-xs text-foreground-lighter">
          Last sync: {new Date(state.overview.lastSyncAt).toLocaleString()}
        </p>
      )}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
        <div className="lg:col-span-2">
          {state.matrix && <SchemaMatrix matrix={state.matrix} />}
        </div>
        <div>
          {state.overview && <ProgressTracker perProject={state.overview.perProject} />}
        </div>
      </div>

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
        <RecommendationsPanel
          recommendations={state.recommendations}
          onGenerateMigration={handleGenerateMigration}
          selectedId={selectedRec?.id ?? null}
        />
        <MigrationPreview
          migration={migration}
          recommendation={selectedRec}
          isLoading={migrationLoading}
          onApply={handleApply}
          applyResult={applyResult}
        />
      </div>
    </div>
  )
}
