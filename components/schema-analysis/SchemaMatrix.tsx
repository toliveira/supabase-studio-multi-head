import { useMemo, useState } from 'react'

import { Input } from 'ui'
import type { MatrixCell, SchemaMatrix as SchemaMatrixType } from '@/lib/schema-analysis/types'

interface SchemaMatrixProps {
  matrix: SchemaMatrixType
}

const CellContent = ({ cell }: { cell: MatrixCell }) => {
  if (!cell.exists) {
    return (
      <span className="inline-flex items-center gap-1 text-destructive-600">
        <span aria-hidden>✗</span>
        <span>missing</span>
      </span>
    )
  }

  if (cell.tableName !== null) {
    const score =
      typeof cell.similarityScore === 'number' ? `${Math.round(cell.similarityScore)}%` : ''
    return (
      <span className="inline-flex items-center gap-1 text-warning-600">
        <span aria-hidden>⚠</span>
        <span className="font-mono text-xs">{cell.tableName}</span>
        {score ? <span className="text-foreground-lighter text-xs">{score}</span> : null}
      </span>
    )
  }

  if (cell.similarityScore !== null && cell.similarityScore < 100) {
    return (
      <span className="inline-flex items-center gap-1 text-brand-600">
        <span aria-hidden>✓</span>
        <span className="text-foreground-lighter text-xs">
          {Math.round(cell.similarityScore)}%
        </span>
      </span>
    )
  }

  return (
    <span className="inline-flex items-center gap-1 text-brand-600">
      <span aria-hidden>✓</span>
      <span>present</span>
    </span>
  )
}

const cellBg = (cell: MatrixCell) => {
  if (!cell.exists) return 'bg-destructive-200/10'
  if (cell.tableName !== null) return 'bg-warning-200/10'
  return ''
}

export const SchemaMatrix = ({ matrix }: SchemaMatrixProps) => {
  const [search, setSearch] = useState('')

  const filteredRows = useMemo(() => {
    if (!search.trim()) return matrix.rows
    const needle = search.trim().toLowerCase()
    return matrix.rows.filter((row) => row.canonicalName.toLowerCase().includes(needle))
  }, [matrix.rows, search])

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between gap-4">
        <Input
          size="small"
          placeholder="Filter tables..."
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          className="max-w-xs"
        />
        <span className="text-xs text-foreground-lighter">
          {filteredRows.length} of {matrix.rows.length} tables · {matrix.projectIds.length}{' '}
          projects
        </span>
      </div>

      <div className="border border-default rounded-md overflow-auto bg-surface-100">
        <table className="w-full text-sm">
          <thead className="bg-surface-200 sticky top-0 z-10">
            <tr>
              <th className="sticky left-0 z-20 bg-surface-200 px-4 py-2 text-left font-medium text-foreground-light border-b border-r border-default min-w-[200px]">
                Table
              </th>
              {matrix.projectIds.map((projectId) => (
                <th
                  key={projectId}
                  className="px-4 py-2 text-left font-medium text-foreground-light border-b border-default min-w-[160px]"
                >
                  {projectId}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {filteredRows.length === 0 ? (
              <tr>
                <td
                  colSpan={matrix.projectIds.length + 1}
                  className="px-4 py-8 text-center text-foreground-lighter"
                >
                  No tables match your filter.
                </td>
              </tr>
            ) : (
              filteredRows.map((row) => (
                <tr key={row.canonicalName} className="hover:bg-surface-200/40">
                  <td className="sticky left-0 z-10 bg-surface-100 px-4 py-2 font-mono text-xs text-foreground border-b border-r border-default">
                    {row.canonicalName}
                  </td>
                  {matrix.projectIds.map((projectId) => {
                    const cell = row.cells[projectId]
                    return (
                      <td
                        key={projectId}
                        className={`px-4 py-2 border-b border-default ${cellBg(cell)}`}
                      >
                        {cell ? <CellContent cell={cell} /> : <span className="text-foreground-lighter">—</span>}
                      </td>
                    )
                  })}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <div className="flex flex-wrap items-center gap-4 text-xs text-foreground-light">
        <span className="font-medium text-foreground">Legend:</span>
        <span className="inline-flex items-center gap-1 text-brand-600">
          <span aria-hidden>✓</span> exact match
        </span>
        <span className="inline-flex items-center gap-1 text-warning-600">
          <span aria-hidden>⚠</span> variant / similar
        </span>
        <span className="inline-flex items-center gap-1 text-destructive-600">
          <span aria-hidden>✗</span> missing
        </span>
      </div>
    </div>
  )
}

export default SchemaMatrix
