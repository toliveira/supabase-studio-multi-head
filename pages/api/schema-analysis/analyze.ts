import type { NextApiRequest, NextApiResponse } from 'next'

import { computeSimilarityPairs, getAllProjectsSchemas } from '@/lib/schema-analysis/schema-analyzer'

export default async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET' && req.method !== 'POST') {
    res.setHeader('Allow', ['GET', 'POST'])
    return res.status(405).json({ error: { message: `Method ${req.method} Not Allowed` } })
  }

  try {
    const startedAt = Date.now()
    const schemas = await getAllProjectsSchemas()
    const pairs = computeSimilarityPairs(schemas)
    const durationMs = Date.now() - startedAt

    return res.status(200).json({
      generatedAt: new Date().toISOString(),
      durationMs,
      projectCount: schemas.size,
      tableCount: [...schemas.values()].reduce((acc, t) => acc + t.length, 0),
      similarPairs: pairs.filter((p) => p.score >= 75).length,
      pairs,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return res.status(500).json({ error: { message } })
  }
}
