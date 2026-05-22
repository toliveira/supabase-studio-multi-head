import { useState } from 'react'
import { Button } from 'ui'

import type {
  MigrationScript,
  Recommendation,
  SchemaMatrix as SchemaMatrixData,
} from '@/lib/schema-analysis/types'

import { MigrationPreview } from './MigrationPreview'
import { ProgressTracker } from './ProgressTracker'
import { RecommendationsPanel } from './RecommendationsPanel'
import { SchemaMatrix } from './SchemaMatrix'

interface DashboardProps {
  matrix: SchemaMatrixData
  recommendations: Recommendation[]
  analysis: {
    generatedAt: string
    durationMs: number
    projectCount: number
    tableCount: number
    similarPairs: number
  }
  onGenerateMigration: (rec: Recommendation) => Promise<{ migration: MigrationScript }>
  onApplyMigration: (rec: Recommendation, dryRun: boolean) => Promise<{ status: string; message?: string }>
  onRefresh?: () => void
  refreshing?: boolean
}

interface PreviewState {
  recommendation: Recommendation
  migration: MigrationScript
  applying: boolean
  applyResult: { status: string; message?: string } | null
}

export function SchemaAnalysisDashboard({
  matrix,
  recommendations,
  analysis,
  onGenerateMigration,
  onApplyMigration,
  onRefresh,
  refreshing,
}: DashboardProps) {
  const [preview, setPreview] = useState<PreviewState | null>(null)
  const [completedIds, setCompletedIds] = useState<string[]>([])

  const handleGenerate = async (rec: Recommendation) => {
    const { migration } = await onGenerateMigration(rec)
    setPreview({ recommendation: rec, migration, applying: false, applyResult: null })
  }

  const handleApply = async (dryRun: boolean) => {
    if (!preview) return
    setPreview({ ...preview, applying: true, applyResult: null })
    try {
      const result = await onApplyMigration(preview.recommendation, dryRun)
      setPreview((curr) => (curr ? { ...curr, applying: false, applyResult: result } : curr))
      if (!dryRun && result.status === 'applied') {
        setCompletedIds((prev) => [...new Set([...prev, preview.recommendation.id])])
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error'
      setPreview((curr) =>
        curr ? { ...curr, applying: false, applyResult: { status: 'error', message } } : curr
      )
    }
  }

  return (
    <div className="flex flex-col gap-6 p-6">
      <header className="flex items-start justify-between">
        <div>
          <h1 className="text-xl font-medium text-foreground">Cross-Project Schema Analysis</h1>
          <p className="text-sm text-foreground-light">
            Compare and standardize schemas across {analysis.projectCount} projects.
          </p>
        </div>
        {onRefresh && (
          <Button type="default" onClick={onRefresh} loading={refreshing}>
            Re-run analysis
          </Button>
        )}
      </header>

      <section className="grid grid-cols-1 md:grid-cols-4 gap-3">
        <Stat label="Standardization" value={`${matrix.overallStandardization}%`} />
        <Stat label="Projects analyzed" value={String(analysis.projectCount)} />
        <Stat label="Tables found" value={String(analysis.tableCount)} />
        <Stat
          label="Similar pairs (≥75%)"
          value={String(analysis.similarPairs)}
          sub={`Last sync: ${new Date(analysis.generatedAt).toLocaleString()}`}
        />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground-light">Schema matrix</h2>
          <SchemaMatrix data={matrix} />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground-light">Progress</h2>
          <ProgressTracker
            matrix={matrix}
            recommendations={recommendations}
            completedMigrationIds={completedIds}
          />
        </div>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground-light">Recommendations</h2>
          <RecommendationsPanel
            recommendations={recommendations}
            onGenerateMigration={handleGenerate}
            selectedId={preview?.recommendation.id ?? null}
          />
        </div>
        <div className="flex flex-col gap-3">
          <h2 className="text-sm font-medium text-foreground-light">Migration preview</h2>
          {preview ? (
            <MigrationPreview
              recommendation={preview.recommendation}
              migration={preview.migration}
              onDryRun={() => handleApply(true)}
              onApply={() => handleApply(false)}
              applying={preview.applying}
              applyResult={preview.applyResult}
            />
          ) : (
            <div className="rounded-md border bg-surface-100 px-4 py-6 text-sm text-foreground-light">
              Select a recommendation to preview its migration script.
            </div>
          )}
        </div>
      </section>
    </div>
  )
}

interface StatProps {
  label: string
  value: string
  sub?: string
}

function Stat({ label, value, sub }: StatProps) {
  return (
    <div className="rounded-md border bg-surface-100 p-4">
      <div className="text-xs text-foreground-light">{label}</div>
      <div className="text-2xl font-medium text-foreground tabular-nums">{value}</div>
      {sub && <div className="text-xs text-foreground-lighter mt-1">{sub}</div>}
    </div>
  )
}
