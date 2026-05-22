import type { NextApiRequest, NextApiResponse } from 'next'

import { generateMigration } from '@/lib/schema-analysis/migration-generator'
import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import { computeSimilarityPairs, getAllProjectsSchemas } from '@/lib/schema-analysis/schema-analyzer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    res.setHeader('Allow', ['POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  try {
    const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body
    const recommendationId: string | undefined = body?.recommendationId
    if (!recommendationId || typeof recommendationId !== 'string') {
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
    return res.status(200).json({ recommendation: rec, migration })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: { message } })
  }
}
