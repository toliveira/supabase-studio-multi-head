import { Badge, Button } from 'ui'

import type { MigrationScript, Recommendation } from '@/lib/schema-analysis/types'

interface MigrationPreviewProps {
  recommendation: Recommendation
  migration: MigrationScript
  onApply: () => void
  onDryRun: () => void
  applying?: boolean
  applyResult?: { status: string; message?: string } | null
}

export function MigrationPreview({
  recommendation,
  migration,
  onApply,
  onDryRun,
  applying,
  applyResult,
}: MigrationPreviewProps) {
  return (
    <div className="rounded-md border bg-surface-100 p-4 flex flex-col gap-3">
      <header className="flex items-center justify-between">
        <div>
          <h3 className="text-sm font-medium text-foreground">{recommendation.recommendation}</h3>
          <p className="text-xs text-foreground-light">{recommendation.rationale}</p>
        </div>
        <div className="flex items-center gap-2">
          <Badge variant={migration.validation.valid ? 'default' : 'destructive'}>
            {migration.validation.valid ? 'valid' : 'invalid'}
          </Badge>
          <span className="text-xs text-foreground-lighter">
            ~{migration.estimatedDurationMs}ms
          </span>
        </div>
      </header>

      {migration.validation.warnings.length > 0 && (
        <div className="rounded border border-warning-400 bg-warning-100 px-3 py-2 text-xs text-warning-700">
          Warnings:
          <ul className="list-disc list-inside">
            {migration.validation.warnings.map((w) => (
              <li key={w}>{w}</li>
            ))}
          </ul>
        </div>
      )}

      {migration.validation.errors.length > 0 && (
        <div className="rounded border border-destructive-400 bg-destructive-100 px-3 py-2 text-xs text-destructive-700">
          Errors:
          <ul className="list-disc list-inside">
            {migration.validation.errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      <section>
        <h4 className="text-xs font-medium text-foreground-light mb-1">Migration SQL</h4>
        <pre className="rounded bg-surface-200 p-3 overflow-x-auto text-xs font-mono text-foreground whitespace-pre">
          {migration.sql}
        </pre>
      </section>

      <section>
        <h4 className="text-xs font-medium text-foreground-light mb-1">Rollback SQL</h4>
        <pre className="rounded bg-surface-200 p-3 overflow-x-auto text-xs font-mono text-foreground whitespace-pre">
          {migration.rollback}
        </pre>
      </section>

      <footer className="flex items-center justify-end gap-2">
        <Button type="default" onClick={onDryRun} loading={applying} disabled={!migration.validation.valid}>
          Dry run
        </Button>
        <Button type="primary" onClick={onApply} loading={applying} disabled={!migration.validation.valid}>
          Apply
        </Button>
      </footer>

      {applyResult && (
        <div className="rounded border border-surface-300 bg-surface-200 px-3 py-2 text-xs text-foreground">
          <span className="font-medium">{applyResult.status}</span>
          {applyResult.message ? `: ${applyResult.message}` : null}
        </div>
      )}
    </div>
  )
}
