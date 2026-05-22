import { Card, CardContent, CardHeader, CardTitle } from 'ui'

import type { ProjectStandardization } from '@/lib/schema-analysis/types'

interface ProgressTrackerProps {
  perProject: ProjectStandardization[]
}

function progressColor(score: number): string {
  if (score >= 80) return 'bg-brand'
  if (score >= 50) return 'bg-warning'
  return 'bg-destructive'
}

export function ProgressTracker({ perProject }: ProgressTrackerProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Per-Project Standardization</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {perProject.map((project) => (
          <div key={project.projectId} className="space-y-1">
            <div className="flex items-center justify-between text-sm">
              <span className="font-mono">{project.projectId}</span>
              <span className="text-foreground-light">
                {project.matchingTables}/{project.totalTables} tables · {project.standardizationScore}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded bg-surface-200">
              <div
                className={`h-full ${progressColor(project.standardizationScore)}`}
                style={{ width: `${project.standardizationScore}%` }}
              />
            </div>
          </div>
        ))}
        {perProject.length === 0 && (
          <p className="text-sm text-foreground-light">No projects to track.</p>
        )}
      </CardContent>
    </Card>
  )
}
