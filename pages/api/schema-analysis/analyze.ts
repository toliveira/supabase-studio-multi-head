import type { NextApiRequest, NextApiResponse } from 'next'

import {
  buildSchemaMatrix,
  clearSchemaCache,
  computeOverview,
  computeSimilarities,
  getAllProjectsSchemas,
} from '@/lib/schema-analysis/schema-analyzer'

const handler = async (req: NextApiRequest, res: NextApiResponse) => {
  if (req.method !== 'GET' && req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' })
  }

  try {
    if (req.method === 'POST' && req.body?.refresh === true) {
      clearSchemaCache()
    }

    const started = Date.now()
    const schemas = await getAllProjectsSchemas()
    const similarities = computeSimilarities(schemas)
    const matrix = buildSchemaMatrix(schemas, similarities)
    const overview = computeOverview(schemas, matrix)
    const durationMs = Date.now() - started

    return res.status(200).json({
      overview,
      durationMs,
      projects: Array.from(schemas.keys()),
    })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error'
    return res.status(500).json({ error: message })
  }
}

export default handler
