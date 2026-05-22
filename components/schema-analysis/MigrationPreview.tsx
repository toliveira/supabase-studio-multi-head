import { useState } from 'react'

import { Button, Modal } from 'ui'
import type {
  MigrationScript,
  MigrationValidationResult,
} from '@/lib/schema-analysis/types'

interface MigrationPreviewProps {
  visible: boolean
  onClose: () => void
  migration: (MigrationScript & { validation: MigrationValidationResult }) | null
  onApply: (sql: string, targetProject: string, dryRun: boolean) => void
  isApplying: boolean
}

export const MigrationPreview = ({
  visible,
  onClose,
  migration,
  onApply,
  isApplying,
}: MigrationPreviewProps) => {
  const [showRollback, setShowRollback] = useState(false)

  return (
    <Modal
      visible={visible}
      onCancel={onClose}
      hideFooter
      size="xxlarge"
      header="Migration preview"
      showCloseButton
    >
      <Modal.Content>
        {migration === null ? (
          <div className="py-10 text-center text-foreground-light">No migration to preview.</div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <div className="lg:col-span-2 flex flex-col gap-3">
              <div>
                <h3 className="text-xs font-medium text-foreground-light uppercase tracking-wide mb-2">
                  Migration SQL
                </h3>
                <pre className="bg-surface-300 border border-default rounded-md p-3 text-xs text-foreground font-mono overflow-auto max-h-[420px] whitespace-pre-wrap">
                  {migration.sql || '-- (empty)'}
                </pre>
              </div>

              <div>
                <button
                  type="button"
                  onClick={() => setShowRollback((v) => !v)}
                  className="text-xs text-foreground-light hover:text-foreground inline-flex items-center gap-1"
                  aria-expanded={showRollback}
                >
                  <span aria-hidden>{showRollback ? '▾' : '▸'}</span>
                  {showRollback ? 'Hide' : 'Show'} rollback script
                </button>
                {showRollback ? (
                  <pre className="mt-2 bg-surface-300 border border-default rounded-md p-3 text-xs text-foreground-light font-mono overflow-auto max-h-[260px] whitespace-pre-wrap">
                    {migration.rollbackSql || '-- (no rollback provided)'}
                  </pre>
                ) : null}
              </div>
            </div>

            <aside className="lg:col-span-1 flex flex-col gap-4">
              <div className="border border-default rounded-md bg-surface-100 p-3 flex flex-col gap-3 text-xs">
                <div>
                  <p className="text-foreground-lighter uppercase tracking-wide">Target project</p>
                  <p className="text-foreground font-mono break-all">{migration.targetProject}</p>
                </div>
                <div>
                  <p className="text-foreground-lighter uppercase tracking-wide">Operations</p>
                  <p className="text-foreground font-mono">{migration.operations.length}</p>
                </div>
                <div>
                  <p className="text-foreground-lighter uppercase tracking-wide">FK updates</p>
                  <p className="text-foreground font-mono">{migration.fkUpdatesRequired}</p>
                </div>
                <div>
                  <p className="text-foreground-lighter uppercase tracking-wide">
                    Estimated rows affected
                  </p>
                  <p className="text-foreground font-mono">{migration.estimatedRowsAffected}</p>
                </div>
              </div>

              <div className="border border-default rounded-md bg-surface-100 p-3 flex flex-col gap-2 text-xs">
                <p className="text-foreground-lighter uppercase tracking-wide">Validation</p>
                {migration.validation.errors.length === 0 &&
                migration.validation.warnings.length === 0 ? (
                  <p className="text-brand-600">No errors or warnings.</p>
                ) : null}
                {migration.validation.errors.length > 0 ? (
                  <ul className="list-disc list-inside text-destructive-600 space-y-1">
                    {migration.validation.errors.map((err, i) => (
                      <li key={`err-${i}`}>{err}</li>
                    ))}
                  </ul>
                ) : null}
                {migration.validation.warnings.length > 0 ? (
                  <ul className="list-disc list-inside text-warning-600 space-y-1">
                    {migration.validation.warnings.map((warn, i) => (
                      <li key={`warn-${i}`}>{warn}</li>
                    ))}
                  </ul>
                ) : null}
              </div>
            </aside>
          </div>
        )}
      </Modal.Content>

      <Modal.Separator />
      <Modal.Content>
        <div className="flex items-center justify-end gap-2">
          <Button type="default" onClick={onClose} disabled={isApplying}>
            Cancel
          </Button>
          <Button
            type="outline"
            disabled={!migration || isApplying || !migration.validation.valid}
            loading={isApplying}
            onClick={() =>
              migration && onApply(migration.sql, migration.targetProject, true)
            }
          >
            Dry Run
          </Button>
          <Button
            type="primary"
            disabled={!migration || isApplying || !migration.validation.valid}
            loading={isApplying}
            onClick={() =>
              migration && onApply(migration.sql, migration.targetProject, false)
            }
          >
            Apply
          </Button>
        </div>
      </Modal.Content>
    </Modal>
  )
}

export default MigrationPreview
