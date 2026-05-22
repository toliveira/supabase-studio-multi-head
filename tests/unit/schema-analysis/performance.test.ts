import { describe, it, expect } from 'vitest'

import { generateLargeSchema } from '@/lib/schema-analysis/__mocks__/data'
import { analyzeSchemas } from '@/lib/schema-analysis/schema-analyzer'
import type { TableSchema } from '@/lib/schema-analysis/types'

describe('performance', () => {
  it('analyzes 4 projects × 30 tables in under 5 seconds', () => {
    const schemas: Record<string, TableSchema[]> = {
      'perf-a': generateLargeSchema('perf-a', 30),
      'perf-b': generateLargeSchema('perf-b', 30),
      'perf-c': generateLargeSchema('perf-c', 30),
      'perf-d': generateLargeSchema('perf-d', 30),
    }

    const start = performance.now()
    const result = analyzeSchemas(schemas)
    const elapsed = performance.now() - start

    expect(elapsed).toBeLessThan(5000)
    expect(result.totalProjects).toBe(4)
    expect(result.matrix.rows.length).toBeGreaterThan(0)
  })
})
