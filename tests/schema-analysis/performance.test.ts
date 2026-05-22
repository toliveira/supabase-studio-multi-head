import { describe, expect, it } from 'vitest'

import { generateLargeSchema } from '@/lib/schema-analysis/__mocks__/data'
import { buildMatrix } from '@/lib/schema-analysis/matrix'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { computeSimilarityPairs } from '@/lib/schema-analysis/schema-analyzer'

describe('performance: 100+ tables across projects', () => {
  it('runs full analyze + matrix + recommendations in <5s', () => {
    const schemas = new Map<string, ReturnType<typeof generateLargeSchema>>()
    schemas.set('big-a', generateLargeSchema('big-a', 100))
    schemas.set('big-b', generateLargeSchema('big-b', 100))

    const start = Date.now()
    const pairs = computeSimilarityPairs(schemas, 75)
    const matrix = buildMatrix(schemas, pairs)
    const recs = generateRecommendations(schemas, pairs)
    const elapsed = Date.now() - start

    expect(elapsed).toBeLessThan(5000)
    expect(matrix.canonicalTables.length).toBeGreaterThan(0)
    expect(recs).toBeDefined()
  })
})
