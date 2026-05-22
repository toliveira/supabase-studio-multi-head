import { Button } from 'ui'
import type { Recommendation, RecommendationType } from '@/lib/schema-analysis/types'

interface RecommendationsPanelProps {
  recommendations: Recommendation[]
  onGenerateMigration: (rec: Recommendation) => void
}

const TYPE_LABEL: Record<RecommendationType, string> = {
  rename: 'RENAME',
  add_table: 'ADD TABLE',
  columns: 'COLUMNS',
  consolidate: 'CONSOLIDATE',
}

const TYPE_CLASSES: Record<RecommendationType, string> = {
  rename: 'bg-warning-200/30 text-warning-600 border border-warning-500/30',
  add_table: 'bg-destructive-200/30 text-destructive-600 border border-destructive-500/30',
  columns: 'bg-purple-500/10 text-purple-600 border border-purple-500/30',
  consolidate: 'bg-blue-500/10 text-blue-600 border border-blue-500/30',
}

const EFFORT_LABEL = {
  low: 'Low effort',
  medium: 'Medium effort',
  high: 'High effort',
} as const

export const RecommendationsPanel = ({
  recommendations,
  onGenerateMigration,
}: RecommendationsPanelProps) => {
  if (recommendations.length === 0) {
    return (
      <div className="flex items-center justify-center border border-default rounded-md bg-surface-100 px-6 py-16">
        <p className="text-sm text-foreground-light text-center">
          No recommendations found. All schemas are consistent.
        </p>
      </div>
    )
  }

  return (
    <div className="flex flex-col gap-3">
      {recommendations.map((rec) => (
        <article
          key={rec.id}
          className="border border-default rounded-md bg-surface-100 p-4 flex flex-col gap-3"
        >
          <header className="flex items-start justify-between gap-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span
                className={`text-[10px] tracking-wide font-mono uppercase px-2 py-0.5 rounded ${TYPE_CLASSES[rec.type]}`}
              >
                {TYPE_LABEL[rec.type]}
              </span>
              <h3 className="text-sm font-medium text-foreground">{rec.title}</h3>
            </div>
            <Button type="primary" size="tiny" onClick={() => onGenerateMigration(rec)}>
              Generate Migration
            </Button>
          </header>

          <p className="text-sm text-foreground-light">{rec.description}</p>

          <dl className="grid grid-cols-2 md:grid-cols-4 gap-3 text-xs">
            <div className="flex flex-col gap-0.5">
              <dt className="text-foreground-lighter uppercase tracking-wide">Confidence</dt>
              <dd className="text-foreground font-mono">{Math.round(rec.confidence)}%</dd>
            </div>
            <div className="flex flex-col gap-0.5">
              <dt className="text-foreground-lighter uppercase tracking-wide">Effort</dt>
              <dd className="text-foreground">{EFFORT_LABEL[rec.effort]}</dd>
            </div>
            <div className="flex flex-col gap-0.5 md:col-span-2">
              <dt className="text-foreground-lighter uppercase tracking-wide">
                Affected projects ({rec.affectedProjects.length})
              </dt>
              <dd className="text-foreground-light font-mono break-words">
                {rec.affectedProjects.join(', ')}
              </dd>
            </div>
          </dl>
        </article>
      ))}
    </div>
  )
}

export default RecommendationsPanel
