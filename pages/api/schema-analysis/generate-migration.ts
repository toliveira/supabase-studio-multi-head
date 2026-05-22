import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import {
  generateMigrationScript,
  validateMigrationScript,
} from '@/lib/schema-analysis/migration-generator'
import type { Recommendation } from '@/lib/schema-analysis/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }
  const recommendation = req.body as Recommendation
  if (!recommendation || !recommendation.type || !recommendation.affectedTables) {
    return res.status(400).json({ error: { message: 'Invalid recommendation payload' } })
  }
  const script = generateMigrationScript(recommendation)
  const validation = validateMigrationScript(script.sql)
  return res.status(200).json({ ...script, validation })
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)
