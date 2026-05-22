import { computeSimilarityPairs } from './schema-analyzer'
import type { MatrixCell, SchemaMatrix, SimilarityPair, TableSchema } from './types'

const VARIANT_THRESHOLD = 75

function frequencyByTableName(schemas: Map<string, TableSchema[]>): Map<string, number> {
  const counts = new Map<string, number>()
  for (const tables of schemas.values()) {
    for (const t of tables) counts.set(t.tableName, (counts.get(t.tableName) ?? 0) + 1)
  }
  return counts
}

interface Cluster {
  canonical: string
  members: Map<string, string>
}

function chooseCanonical(names: string[], counts: Map<string, number>): string {
  return [...names].sort((a, b) => {
    const ca = counts.get(a) ?? 0
    const cb = counts.get(b) ?? 0
    if (cb !== ca) return cb - ca
    return a.localeCompare(b)
  })[0]
}

function clusterTables(
  schemas: Map<string, TableSchema[]>,
  pairs: SimilarityPair[],
  threshold = VARIANT_THRESHOLD
): Cluster[] {
  const allTables: { projectId: string; tableName: string }[] = []
  for (const [projectId, tables] of schemas)
    for (const t of tables) allTables.push({ projectId, tableName: t.tableName })

  const keyOf = (p: string, t: string) => `${p}::${t}`
  const parent = new Map<string, string>()
  const find = (k: string): string => {
    const p = parent.get(k)
    if (!p || p === k) return p ?? k
    const root = find(p)
    parent.set(k, root)
    return root
  }
  const union = (a: string, b: string) => {
    const ra = find(a)
    const rb = find(b)
    if (ra !== rb) parent.set(ra, rb)
  }

  for (const { projectId, tableName } of allTables) parent.set(keyOf(projectId, tableName), keyOf(projectId, tableName))

  for (const p of pairs) {
    if (p.score >= threshold) {
      union(keyOf(p.projectA, p.tableA), keyOf(p.projectB, p.tableB))
    }
  }

  // exact-name match across projects: always group
  const byName = new Map<string, string[]>()
  for (const { projectId, tableName } of allTables) {
    const arr = byName.get(tableName) ?? []
    arr.push(keyOf(projectId, tableName))
    byName.set(tableName, arr)
  }
  for (const keys of byName.values()) {
    for (let i = 1; i < keys.length; i++) union(keys[0], keys[i])
  }

  const groups = new Map<string, { projectId: string; tableName: string }[]>()
  for (const t of allTables) {
    const root = find(keyOf(t.projectId, t.tableName))
    const arr = groups.get(root) ?? []
    arr.push(t)
    groups.set(root, arr)
  }

  const counts = frequencyByTableName(schemas)
  const clusters: Cluster[] = []
  for (const members of groups.values()) {
    const names = [...new Set(members.map((m) => m.tableName))]
    const canonical = chooseCanonical(names, counts)
    const memberMap = new Map<string, string>()
    for (const { projectId, tableName } of members) {
      const existing = memberMap.get(projectId)
      if (!existing || tableName === canonical) memberMap.set(projectId, tableName)
    }
    clusters.push({ canonical, members: memberMap })
  }

  return clusters.sort((a, b) => b.members.size - a.members.size || a.canonical.localeCompare(b.canonical))
}

export function buildMatrix(
  schemas: Map<string, TableSchema[]>,
  pairs?: SimilarityPair[]
): SchemaMatrix {
  const projects = [...schemas.keys()].sort()
  const similarityPairs = pairs ?? computeSimilarityPairs(schemas)
  const clusters = clusterTables(schemas, similarityPairs)

  const pairLookup = new Map<string, number>()
  for (const p of similarityPairs) {
    pairLookup.set(`${p.projectA}::${p.tableA}::${p.projectB}::${p.tableB}`, p.score)
    pairLookup.set(`${p.projectB}::${p.tableB}::${p.projectA}::${p.tableA}`, p.score)
  }

  const canonicalTables = clusters.map((c) => c.canonical)
  const cells: MatrixCell[] = []
  const perProjectTotals = new Map<string, { exact: number; variant: number; missing: number }>()
  for (const p of projects) perProjectTotals.set(p, { exact: 0, variant: 0, missing: 0 })

  for (const cluster of clusters) {
    const canonicalProject = [...cluster.members.entries()].find(([, name]) => name === cluster.canonical)?.[0]
    for (const projectId of projects) {
      const actual = cluster.members.get(projectId) ?? null
      let status: MatrixCell['status']
      let score = 0
      if (actual === null) {
        status = 'missing'
      } else if (actual === cluster.canonical) {
        status = 'exact'
        score = 100
      } else {
        status = 'variant'
        if (canonicalProject)
          score = pairLookup.get(`${projectId}::${actual}::${canonicalProject}::${cluster.canonical}`) ?? 0
      }
      cells.push({
        projectId,
        canonicalTable: cluster.canonical,
        actualTableName: actual,
        status,
        similarityScore: score,
      })
      const totals = perProjectTotals.get(projectId)!
      totals[status]++
    }
  }

  const perProjectStandardization: Record<string, number> = {}
  let exactSum = 0
  let cellCount = 0
  for (const [projectId, totals] of perProjectTotals) {
    const denom = totals.exact + totals.variant + totals.missing
    perProjectStandardization[projectId] = denom === 0 ? 0 : Math.round((totals.exact / denom) * 100)
    exactSum += totals.exact
    cellCount += denom
  }
  const overall = cellCount === 0 ? 0 : Math.round((exactSum / cellCount) * 100)

  return {
    projects,
    canonicalTables,
    cells,
    overallStandardization: overall,
    perProjectStandardization,
    generatedAt: new Date().toISOString(),
  }
}
