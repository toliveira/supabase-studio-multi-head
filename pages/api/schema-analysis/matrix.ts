import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { buildSchemaMatrix } from '@/lib/schema-analysis/schema-analyzer'
import { ALL_PROJECTS_SCHEMAS } from '@/lib/schema-analysis/__mocks__/data'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'GET') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }
  const matrix = buildSchemaMatrix(ALL_PROJECTS_SCHEMAS)
  return res.status(200).json(matrix)
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)
