import type { NextApiRequest, NextApiResponse } from 'next'

import { generateRecommendations } from '@/lib/schema-analysis/recommendation-engine'
import {
  computeSimilarities,
  getAllProjectsSchemas,
} from '@/lib/schema-analysis/schema-analyzer'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: 'Method not allowed' })
  }
  try {
    const schemas = await getAllProjectsSchemas()
    const similarities = computeSimilarities(schemas)
    const recommendations = generateRecommendations(schemas, similarities)
    return res.status(200).json({ recommendations })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

export default handler
