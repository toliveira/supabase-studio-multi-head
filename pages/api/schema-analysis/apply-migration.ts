import type { NextApiRequest, NextApiResponse } from 'next'

import {
  buildMigration,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import {
  computeSimilarities,
  getAllProjectsSchemas,
} from '@/lib/schema-analysis/schema-analyzer'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const recommendationId =
      typeof req.body?.recommendationId === 'string' ? req.body.recommendationId : null
    const dryRun = req.body?.dryRun !== false // default true — destructive ops require explicit dryRun: false

    if (!recommendationId) {
      return res.status(400).json({ error: 'recommendationId is required' })
    }

    const schemas = await getAllProjectsSchemas()
    const similarities = computeSimilarities(schemas)
    const recommendations = generateRecommendations(schemas, similarities)
    const recommendation = recommendations.find((r) => r.id === recommendationId)
    if (!recommendation) {
      return res.status(404).json({ error: 'Recommendation not found' })
    }

    const migration = buildMigration(recommendation)
    const validation = validateMigrationScript(migration.upScript)
    if (!validation.valid) {
      return res.status(400).json({
        error: 'Migration script failed validation',
        validation,
      })
    }

    if (dryRun) {
      return res.status(200).json({
        applied: false,
        dryRun: true,
        migration,
        recommendation,
        message:
          'Dry-run successful. Migration script is valid and ready to apply against the target project.',
      })
    }

    // Real apply is intentionally not implemented — wired to the multi-head CLI in a follow-up.
    return res.status(501).json({
      error:
        'Live migration apply is not enabled. Use dry-run mode or apply the generated SQL via the multi-head CLI.',
      migration,
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

export default handler
