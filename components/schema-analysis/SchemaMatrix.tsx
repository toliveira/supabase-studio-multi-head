import { Badge, cn } from 'ui'

import type { SchemaMatrix as SchemaMatrixData } from '@/lib/schema-analysis/types'

interface SchemaMatrixProps {
  data: SchemaMatrixData
}

function cellClass(status: 'exact' | 'variant' | 'missing'): string {
  if (status === 'exact') return 'bg-brand-200 text-brand-700 border-brand-400'
  if (status === 'variant') return 'bg-warning-200 text-warning-700 border-warning-400'
  return 'bg-destructive-200 text-destructive-700 border-destructive-400'
}

function symbol(status: 'exact' | 'variant' | 'missing'): string {
  if (status === 'exact') return '✓'
  if (status === 'variant') return '⚠'
  return '✗'
}

export function SchemaMatrix({ data }: SchemaMatrixProps) {
  const cellLookup = new Map<string, (typeof data.cells)[number]>()
  for (const c of data.cells) cellLookup.set(`${c.canonicalTable}::${c.projectId}`, c)

  return (
    <div className="overflow-x-auto border rounded-md bg-surface-100">
      <table className="min-w-full text-sm">
        <thead>
          <tr className="border-b bg-surface-200">
            <th className="text-left px-3 py-2 font-medium text-foreground-light sticky left-0 bg-surface-200">
              Canonical table
            </th>
            {data.projects.map((p) => (
              <th key={p} className="text-left px-3 py-2 font-medium text-foreground-light">
                {p}
                <span className="ml-2 text-xs text-foreground-lighter">
                  {data.perProjectStandardization[p] ?? 0}%
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.canonicalTables.map((tableName) => (
            <tr key={tableName} className="border-b last:border-0">
              <td className="px-3 py-2 font-mono text-foreground sticky left-0 bg-surface-100">
                {tableName}
              </td>
              {data.projects.map((projectId) => {
                const cell = cellLookup.get(`${tableName}::${projectId}`)
                if (!cell)
                  return (
                    <td key={projectId} className="px-3 py-2 text-foreground-lighter">
                      —
                    </td>
                  )
                return (
                  <td key={projectId} className="px-3 py-2">
                    <div
                      title={
                        cell.status === 'missing'
                          ? `Missing in ${projectId}`
                          : `Actual: ${cell.actualTableName} (similarity ${cell.similarityScore}%)`
                      }
                      className={cn(
                        'inline-flex items-center gap-2 px-2 py-1 rounded border text-xs font-medium',
                        cellClass(cell.status)
                      )}
                    >
                      <span>{symbol(cell.status)}</span>
                      <span className="font-mono">
                        {cell.actualTableName ?? 'missing'}
                      </span>
                      {cell.status !== 'exact' && cell.status !== 'missing' && (
                        <Badge variant="default">{cell.similarityScore}%</Badge>
                      )}
                    </div>
                  </td>
                )
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
