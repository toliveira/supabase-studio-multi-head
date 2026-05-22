import type { AnalysisResult } from '@/lib/schema-analysis/types'

interface ProgressTrackerProps {
  analysis: AnalysisResult
}

interface ProjectProgress {
  projectId: string
  tablesPresent: number
  tablesStandardized: number
  totalRows: number
  score: number
}

const barColor = (score: number) => {
  if (score >= 80) return 'bg-brand-500'
  if (score >= 50) return 'bg-warning-500'
  return 'bg-destructive-500'
}

const computeProjectProgress = (analysis: AnalysisResult): ProjectProgress[] => {
  const totalRows = analysis.matrix.rows.length
  return analysis.matrix.projectIds.map((projectId) => {
    let tablesPresent = 0
    let tablesStandardized = 0

    analysis.matrix.rows.forEach((row) => {
      const cell = row.cells[projectId]
      if (!cell) return
      if (cell.exists) tablesPresent += 1
      if (cell.exists && cell.tableName === null && cell.similarityScore === null) {
        tablesStandardized += 1
      }
    })

    const score = totalRows > 0 ? (tablesStandardized / totalRows) * 100 : 0
    return { projectId, tablesPresent, tablesStandardized, totalRows, score }
  })
}

export const ProgressTracker = ({ analysis }: ProgressTrackerProps) => {
  const progress = computeProjectProgress(analysis)

  if (progress.length === 0) {
    return (
      <div className="border border-default rounded-md bg-surface-100 p-6 text-center text-sm text-foreground-light">
        No projects to track yet.
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {progress.map((p) => (
        <div
          key={p.projectId}
          className="border border-default rounded-md bg-surface-100 p-4 flex flex-col gap-2"
        >
          <div className="flex items-center justify-between gap-4">
            <div className="flex flex-col">
              <span className="text-sm font-medium text-foreground font-mono">{p.projectId}</span>
              <span className="text-xs text-foreground-lighter">
                {p.tablesPresent} of {p.totalRows} tables present
              </span>
            </div>
            <span className="text-sm font-mono text-foreground">{Math.round(p.score)}%</span>
          </div>
          <div className="h-2 rounded-full bg-surface-300 overflow-hidden">
            <div
              className={`h-full ${barColor(p.score)} transition-all`}
              style={{ width: `${Math.min(100, Math.max(0, p.score))}%` }}
              role="progressbar"
              aria-valuenow={Math.round(p.score)}
              aria-valuemin={0}
              aria-valuemax={100}
            />
          </div>
        </div>
      ))}
    </div>
  )
}

export default ProgressTracker
