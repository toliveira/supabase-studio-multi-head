import type { Recommendation, SchemaMatrix } from '@/lib/schema-analysis/types'

interface ProgressTrackerProps {
  matrix: SchemaMatrix
  recommendations: Recommendation[]
  completedMigrationIds?: string[]
}

export function ProgressTracker({
  matrix,
  recommendations,
  completedMigrationIds = [],
}: ProgressTrackerProps) {
  const pendingCount = recommendations.filter((r) => !completedMigrationIds.includes(r.id)).length

  return (
    <div className="rounded-md border bg-surface-100 p-4 flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-foreground">Progress</h3>
        <span className="text-xs text-foreground-lighter">
          {pendingCount} pending · {completedMigrationIds.length} applied
        </span>
      </div>

      <ul className="flex flex-col gap-2">
        {matrix.projects.map((projectId) => {
          const pct = matrix.perProjectStandardization[projectId] ?? 0
          return (
            <li key={projectId} className="flex items-center gap-3 text-sm">
              <span className="w-28 font-mono text-foreground">{projectId}</span>
              <div className="flex-1 h-2 rounded-full bg-surface-200 overflow-hidden">
                <div
                  className="h-full bg-brand-500"
                  style={{ width: `${Math.min(100, Math.max(0, pct))}%` }}
                />
              </div>
              <span className="w-12 text-right tabular-nums text-foreground-light text-xs">
                {pct}%
              </span>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
