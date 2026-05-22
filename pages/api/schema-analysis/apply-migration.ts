import type { NextApiRequest, NextApiResponse } from 'next'

import { generateMigration, validateMigrationScript } from '@/lib/schema-analysis/migration-generator'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { computeSimilarityPairs, getAllProjectsSchemas } from '@/lib/schema-analysis/schema-analyzer'

interface ApplyBody {
  recommendationId?: string
  dryRun?: boolean
  confirm?: boolean
}

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  try {
    const body: ApplyBody = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const { recommendationId, dryRun = true, confirm = false } = body

    if (!recommendationId) {
      return res.status(400).json({ error: { message: 'recommendationId is required' } })
    }

    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarityPairs(schemas)
    const recommendations = generateRecommendations(schemas, pairs)
    const rec = recommendations.find((r) => r.id === recommendationId)
    if (!rec) {
      return res.status(404).json({ error: { message: `Recommendation ${recommendationId} not found` } })
    }

    const migration = generateMigration(rec)
    const validation = validateMigrationScript(migration.sql)

    if (!validation.valid) {
      return res.status(400).json({
        status: 'rejected',
        reason: 'Validation failed',
        validation,
        migration,
      })
    }

    if (dryRun) {
      return res.status(200).json({
        status: 'dry-run',
        message: 'Validation passed. No changes were applied.',
        validation,
        migration,
      })
    }

    if (!confirm) {
      return res.status(400).json({
        status: 'requires-confirmation',
        message: 'Pass { confirm: true } to apply a live migration.',
        migration,
      })
    }

    // Intentionally not executing: the spec forbids destructive operations without
    // explicit operator review. Wire to pg-meta query execution behind an admin gate
    // when ready.
    return res.status(501).json({
      status: 'not-implemented',
      message: 'Live migration execution is intentionally disabled in this build.',
      migration,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: { message } })
  }
}
