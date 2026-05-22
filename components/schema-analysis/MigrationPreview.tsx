import {
  Badge,
  Button,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from 'ui'

import type { MigrationScript, Recommendation } from '@/lib/schema-analysis/types'

interface MigrationPreviewProps {
  migration: MigrationScript | null
  recommendation: Recommendation | null
  isLoading: boolean
  onApply: (recommendation: Recommendation, dryRun: boolean) => void
  applyResult: string | null
}

export function MigrationPreview({
  migration,
  recommendation,
  isLoading,
  onApply,
  applyResult,
}: MigrationPreviewProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Migration Preview</CardTitle>
        <CardDescription>
          Generated SQL with rollback. Migrations are never applied automatically — use Dry Run to validate, or Apply to attempt execution.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {isLoading && (
          <p className="text-sm text-foreground-light">Generating migration…</p>
        )}
        {!isLoading && !migration && (
          <p className="text-sm text-foreground-light">
            Select a recommendation to generate a migration script.
          </p>
        )}
        {migration && recommendation && (
          <>
            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Badge variant={migration.validation.valid ? 'success' : 'destructive'}>
                {migration.validation.valid ? 'Valid' : 'Invalid'}
              </Badge>
              <Badge variant="default">{migration.estimatedDuration}</Badge>
              {migration.validation.warnings.map((w, i) => (
                <Badge key={i} variant="warning">{w}</Badge>
              ))}
            </div>

            <div>
              <h4 className="mb-1 text-xs font-medium text-foreground-light">UP migration</h4>
              <pre className="overflow-x-auto rounded bg-surface-200 p-3 text-xs font-mono leading-relaxed">
                {migration.upScript}
              </pre>
            </div>
            <div>
              <h4 className="mb-1 text-xs font-medium text-foreground-light">DOWN (rollback)</h4>
              <pre className="overflow-x-auto rounded bg-surface-200 p-3 text-xs font-mono leading-relaxed">
                {migration.downScript}
              </pre>
            </div>

            {migration.validation.errors.length > 0 && (
              <div className="rounded border border-destructive-400 bg-destructive-200 p-2 text-xs text-destructive">
                {migration.validation.errors.map((err, i) => (
                  <p key={i}>{err}</p>
                ))}
              </div>
            )}

            <div className="flex gap-2">
              <Button
                type="default"
                size="tiny"
                onClick={() => onApply(recommendation, true)}
                disabled={!migration.validation.valid}
              >
                Dry Run
              </Button>
              <Button
                type="primary"
                size="tiny"
                onClick={() => onApply(recommendation, false)}
                disabled={!migration.validation.valid}
              >
                Apply
              </Button>
            </div>

            {applyResult && (
              <pre className="overflow-x-auto rounded border border-default bg-surface-75 p-3 text-xs">
                {applyResult}
              </pre>
            )}
          </>
        )}
      </CardContent>
    </Card>
  )
}
