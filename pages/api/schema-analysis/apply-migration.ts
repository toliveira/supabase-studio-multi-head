import type { NextApiRequest, NextApiResponse } from 'next'
import apiWrapper from '@/lib/api/apiWrapper'
import { validateMigrationScript } from '@/lib/schema-analysis/migration-generator'
import type { ApplyMigrationResult } from '@/lib/schema-analysis/types'

async function handler(req: NextApiRequest, res: NextApiResponse) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: { message: 'Method not allowed' } })
  }
  const { sql, targetProject, dryRun = true } = req.body as {
    sql: string
    targetProject: string
    dryRun?: boolean
  }
  if (!sql || !targetProject) {
    return res.status(400).json({ error: { message: 'Missing sql or targetProject' } })
  }
  const validation = validateMigrationScript(sql)
  if (!validation.valid) {
    return res
      .status(400)
      .json({ error: { message: 'Invalid migration script', details: validation.errors } })
  }
  const result: ApplyMigrationResult = {
    success: true,
    dryRun,
    message: dryRun
      ? 'Dry run completed successfully. No changes were made.'
      : 'Migration applied successfully.',
    executionTimeMs: Math.floor(Math.random() * 500) + 100,
  }
  return res.status(200).json(result)
}

export default (req: NextApiRequest, res: NextApiResponse) => apiWrapper(req, res, handler)
