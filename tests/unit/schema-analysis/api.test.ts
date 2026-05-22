import { createMocks } from 'node-mocks-http'
import { describe, expect, it } from 'vitest'

import analyze from '@/pages/api/schema-analysis/analyze'
import applyMigration from '@/pages/api/schema-analysis/apply-migration'
import generateMigration from '@/pages/api/schema-analysis/generate-migration'
import matrix from '@/pages/api/schema-analysis/matrix'
import recommendations from '@/pages/api/schema-analysis/recommendations'

type Handler = (req: any, res: any) => Promise<void> | void

async function callApi(
  handler: Handler,
  method: 'GET' | 'POST',
  body?: Record<string, unknown>
) {
  const { req, res } = createMocks({ method, body })
  await handler(req, res)
  const data = res._getData()
  let parsed: any = null
  try {
    parsed = JSON.parse(data)
  } catch {
    parsed = data
  }
  return { status: res._getStatusCode(), body: parsed }
}

describe('GET /api/schema-analysis/analyze', () => {
  it('returns an overview', async () => {
    const { status, body } = await callApi(analyze, 'GET')
    expect(status).toBe(200)
    expect(body.overview).toBeDefined()
    expect(body.overview.totalProjects).toBe(4)
    expect(body.durationMs).toBeGreaterThanOrEqual(0)
  })

  it('rejects non-GET/POST', async () => {
    const { req, res } = createMocks({ method: 'DELETE' })
    await analyze(req as any, res as any)
    expect(res._getStatusCode()).toBe(405)
  })
})

describe('GET /api/schema-analysis/matrix', () => {
  it('returns the matrix', async () => {
    const { status, body } = await callApi(matrix, 'GET')
    expect(status).toBe(200)
    expect(body.projects.length).toBe(4)
    expect(body.canonicalTables.length).toBeGreaterThan(0)
  })
})

describe('GET /api/schema-analysis/recommendations', () => {
  it('returns a recommendations array', async () => {
    const { status, body } = await callApi(recommendations, 'GET')
    expect(status).toBe(200)
    expect(Array.isArray(body.recommendations)).toBe(true)
    expect(body.recommendations.length).toBeGreaterThan(0)
  })
})

describe('POST /api/schema-analysis/generate-migration', () => {
  it('returns 400 when recommendationId is missing', async () => {
    const { status } = await callApi(generateMigration, 'POST', {})
    expect(status).toBe(400)
  })

  it('returns 404 for an unknown recommendation', async () => {
    const { status } = await callApi(generateMigration, 'POST', {
      recommendationId: 'does-not-exist',
    })
    expect(status).toBe(404)
  })

  it('returns a migration script for a valid recommendation', async () => {
    const recs = await callApi(recommendations, 'GET')
    const renameRec = recs.body.recommendations.find(
      (r: any) => r.type === 'rename_table'
    )
    expect(renameRec).toBeDefined()
    const { status, body } = await callApi(generateMigration, 'POST', {
      recommendationId: renameRec.id,
    })
    expect(status).toBe(200)
    expect(body.migration.upScript).toContain('ALTER TABLE')
    expect(body.migration.validation.valid).toBe(true)
  })
})

describe('POST /api/schema-analysis/apply-migration', () => {
  it('returns 400 without recommendationId', async () => {
    const { status } = await callApi(applyMigration, 'POST', {})
    expect(status).toBe(400)
  })

  it('dry-run returns applied: false', async () => {
    const recs = await callApi(recommendations, 'GET')
    const renameRec = recs.body.recommendations.find(
      (r: any) => r.type === 'rename_table'
    )
    const { status, body } = await callApi(applyMigration, 'POST', {
      recommendationId: renameRec.id,
      dryRun: true,
    })
    expect(status).toBe(200)
    expect(body.applied).toBe(false)
    expect(body.dryRun).toBe(true)
  })

  it('live apply returns 501 (not implemented)', async () => {
    const recs = await callApi(recommendations, 'GET')
    const renameRec = recs.body.recommendations.find(
      (r: any) => r.type === 'rename_table'
    )
    const { status } = await callApi(applyMigration, 'POST', {
      recommendationId: renameRec.id,
      dryRun: false,
    })
    expect(status).toBe(501)
  })
})
