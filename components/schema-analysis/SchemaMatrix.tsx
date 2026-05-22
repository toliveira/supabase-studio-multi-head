import { useMemo, useState } from 'react'

import {
  Badge,
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from 'ui'

import type { MatrixCell, SchemaMatrix as SchemaMatrixData } from '@/lib/schema-analysis/types'

interface SchemaMatrixProps {
  matrix: SchemaMatrixData
}

function cellTone(cell: MatrixCell): {
  symbol: string
  className: string
  label: string
} {
  if (!cell.exists) {
    return {
      symbol: '✗',
      className: 'bg-destructive-200 text-destructive border-destructive-400',
      label: 'Missing',
    }
  }
  if (cell.variantName) {
    return {
      symbol: '⚠',
      className: 'bg-warning-200 text-warning border-warning-400',
      label: `Variant: ${cell.variantName}`,
    }
  }
  return {
    symbol: '✓',
    className: 'bg-brand-200 text-brand border-brand-400',
    label: 'Exact match',
  }
}

export function SchemaMatrix({ matrix }: SchemaMatrixProps) {
  const [filter, setFilter] = useState('')

  const visibleTables = useMemo(() => {
    const q = filter.trim().toLowerCase()
    if (!q) return matrix.canonicalTables
    return matrix.canonicalTables.filter((name) =>
      name.toLowerCase().includes(q)
    )
  }, [filter, matrix.canonicalTables])

  return (
    <Card>
      <CardHeader>
        <CardTitle>Schema Matrix</CardTitle>
        <CardDescription>
          Projects × tables. ✓ exact match, ⚠ variant name, ✗ missing. Hover a cell for details.
        </CardDescription>
        <div className="pt-2">
          <Input
            placeholder="Filter tables…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            size="tiny"
          />
        </div>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-48">Canonical table</TableHead>
                {matrix.projects.map((projectId) => (
                  <TableHead key={projectId} className="text-center font-mono text-xs">
                    {projectId}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {visibleTables.map((tableName) => (
                <TableRow key={tableName}>
                  <TableCell className="font-mono text-sm">{tableName}</TableCell>
                  {matrix.projects.map((projectId) => {
                    const cell = matrix.cells[tableName]?.[projectId] ?? { exists: false }
                    const tone = cellTone(cell)
                    const tooltip = `${tone.label}${
                      cell.similarityScore !== undefined
                        ? ` · ${cell.similarityScore}% similarity`
                        : ''
                    }`
                    return (
                      <TableCell key={projectId} className="text-center">
                        <div
                          title={tooltip}
                          className={`mx-auto flex h-10 w-full max-w-[8rem] items-center justify-center rounded border text-sm ${tone.className}`}
                        >
                          <div className="flex flex-col items-center">
                            <span className="text-base leading-none">{tone.symbol}</span>
                            {cell.variantName ? (
                              <span className="font-mono text-[10px] opacity-80">
                                {cell.variantName}
                              </span>
                            ) : null}
                            {cell.similarityScore !== undefined ? (
                              <span className="text-[10px] opacity-80">
                                {cell.similarityScore}%
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </TableCell>
                    )
                  })}
                </TableRow>
              ))}
              {visibleTables.length === 0 && (
                <TableRow>
                  <TableCell colSpan={matrix.projects.length + 1} className="text-center">
                    No tables match the current filter.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
        <div className="mt-4 flex gap-2 text-xs text-foreground-light">
          <Badge variant="success">✓ Exact</Badge>
          <Badge variant="warning">⚠ Variant</Badge>
          <Badge variant="destructive">✗ Missing</Badge>
        </div>
      </CardContent>
    </Card>
  )
}
