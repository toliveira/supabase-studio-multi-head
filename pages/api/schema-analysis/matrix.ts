import type { NextApiRequest, NextApiResponse } from 'next'

import { buildMatrix } from '@/lib/schema-analysis/matrix'
import { computeSimilarityPairs, getAllProjectsSchemas } from '@/lib/schema-analysis/schema-analyzer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    res.setHeader('Allow', ['GET'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  try {
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarityPairs(schemas)
    const matrix = buildMatrix(schemas, pairs)
    return res.status(200).json(matrix)
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: { message } })
  }
}
