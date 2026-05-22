import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'ui'

import type { EffortLevel, Recommendation } from '@/lib/schema-analysis/types'

interface RecommendationsPanelProps {
  recommendations: Recommendation[]
  onGenerateMigration: (recommendation: Recommendation) => void
  selectedId?: string | null
}

const effortVariant: Record<EffortLevel, 'success' | 'warning' | 'destructive'> = {
  low: 'success',
  medium: 'warning',
  high: 'destructive',
}

export function RecommendationsPanel({
  recommendations,
  onGenerateMigration,
  selectedId,
}: RecommendationsPanelProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recommendations</CardTitle>
        <CardDescription>
          Prioritized standardization actions across your projects.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {recommendations.length === 0 && (
          <p className="text-sm text-foreground-light">
            No recommendations — all projects are well-aligned.
          </p>
        )}
        {recommendations.map((rec) => {
          const isSelected = selectedId === rec.id
          return (
            <div
              key={rec.id}
              className={`rounded border p-3 transition-colors ${
                isSelected ? 'border-brand bg-surface-100' : 'border-default bg-surface-75'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="text-sm font-medium">{rec.title}</h4>
                    <Badge variant="default">{rec.type.replace(/_/g, ' ')}</Badge>
                    <Badge variant={effortVariant[rec.effort]}>
                      {rec.effort} effort
                    </Badge>
                    <Badge variant="default">
                      {Math.round(rec.confidence * 100)}% confidence
                    </Badge>
                  </div>
                  <p className="text-xs text-foreground-light">{rec.recommendation}</p>
                  <p className="text-xs font-mono text-foreground-lighter">
                    {rec.affectedTables
                      .map((t) => `${t.projectId}.${t.tableName}`)
                      .join(', ')}
                  </p>
                </div>
                <Button
                  type="default"
                  size="tiny"
                  onClick={() => onGenerateMigration(rec)}
                >
                  Generate migration
                </Button>
              </div>
            </div>
          )
        })}
      </CardContent>
    </Card>
  )
}
