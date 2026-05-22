import { Badge, Button } from 'ui'

import type { Recommendation } from '@/lib/schema-analysis/types'

interface RecommendationsPanelProps {
  recommendations: Recommendation[]
  onGenerateMigration: (rec: Recommendation) => void
  selectedId?: string | null
}

const effortVariant: Record<Recommendation['effort'], 'default' | 'warning' | 'destructive'> = {
  low: 'default',
  medium: 'warning',
  high: 'destructive',
}

const typeLabel: Record<Recommendation['type'], string> = {
  rename_table: 'Rename table',
  rename_column: 'Rename column',
  add_missing_table: 'Add missing table',
  consolidate_tables: 'Consolidate tables',
}

export function RecommendationsPanel({
  recommendations,
  onGenerateMigration,
  selectedId,
}: RecommendationsPanelProps) {
  if (recommendations.length === 0) {
    return (
      <div className="rounded-md border bg-surface-100 px-4 py-6 text-sm text-foreground-light">
        No standardization opportunities detected.
      </div>
    )
  }

  return (
    <ul className="flex flex-col gap-3">
      {recommendations.map((rec) => {
        const isSelected = selectedId === rec.id
        return (
          <li
            key={rec.id}
            className={`rounded-md border bg-surface-100 px-4 py-3 ${
              isSelected ? 'border-brand-500' : ''
            }`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <Badge variant="default">{typeLabel[rec.type]}</Badge>
                  <Badge variant={effortVariant[rec.effort]}>{rec.effort} effort</Badge>
                  <span className="text-xs text-foreground-lighter">
                    {Math.round(rec.confidence * 100)}% confidence
                  </span>
                </div>
                <p className="text-sm text-foreground">{rec.recommendation}</p>
                <p className="text-xs text-foreground-light mt-1">{rec.rationale}</p>
              </div>
              <Button type="default" size="tiny" onClick={() => onGenerateMigration(rec)}>
                Generate migration
              </Button>
            </div>
          </li>
        )
      })}
    </ul>
  )
}
