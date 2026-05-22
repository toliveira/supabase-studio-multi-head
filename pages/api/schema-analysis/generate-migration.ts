import type { NextApiRequest, NextApiResponse } from 'next'

import { buildMigration } from '@/lib/schema-analysis/migration-generator'
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
    return res.status(200).json({ migration, recommendation })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

export default handler
