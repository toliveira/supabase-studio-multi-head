import { calculateNameSimilarity } from './similarity'
import type {
  Recommendation,
  SimilarityPair,
  TableSchema,
} from './types'

const HIGH_CONFIDENCE_THRESHOLD = 90
const MEDIUM_CONFIDENCE_THRESHOLD = 80

function rid(prefix: string, ...parts: string[]): string {
  return `${prefix}:${parts.join(':')}`
}

function pickCanonicalName(candidates: string[]): string {
  return candidates
    .slice()
    .sort((a, b) => a.length - b.length || a.localeCompare(b))[0]
}

function scoreToConfidence(score: number): number {
  // Convert similarity 0-100 to confidence 0-1 with floor at 0.7 for valid candidates
  return Math.max(0.7, Math.min(1, score / 100))
}

function effortFromSize(table: TableSchema | undefined): 'low' | 'medium' | 'high' {
  if (!table) return 'low'
  if (table.rowCount > 50000) return 'high'
  if (table.rowCount > 5000) return 'medium'
  return 'low'
}

function generateRenameRecommendations(
  similarities: SimilarityPair[],
  schemas: Map<string, TableSchema[]>
): Recommendation[] {
  const recs: Recommendation[] = []
  // Group by canonical concept (use clustering: any pair with similarity above threshold)
  // For each cluster of similar tables across projects, recommend renames to canonical name
  const seen = new Set<string>()

  // Simple union-find on table identities
  const parent = new Map<string, string>()
  const key = (projectId: string, tableName: string) => `${projectId}::${tableName}`
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k)
    let cur = k
    while (parent.get(cur) !== cur) cur = parent.get(cur)!
    return cur
  }
  const union = (a: string, b: string) => {
    const rA = find(a)
    const rB = find(b)
    if (rA !== rB) parent.set(rA, rB)
  }

  for (const pair of similarities) {
    union(key(pair.projectA, pair.tableA), key(pair.projectB, pair.tableB))
  }

  const clusters = new Map<string, string[]>()
  for (const k of parent.keys()) {
    const root = find(k)
    if (!clusters.has(root)) clusters.set(root, [])
    clusters.get(root)!.push(k)
  }

  for (const members of clusters.values()) {
    if (members.length < 2) continue
    const distinctNames = Array.from(new Set(members.map((m) => m.split('::')[1])))
    if (distinctNames.length < 2) continue
    const canonical = pickCanonicalName(distinctNames)
    for (const member of members) {
      const [projectId, tableName] = member.split('::')
      if (tableName === canonical) continue
      const id = rid('rename_table', projectId, tableName, canonical)
      if (seen.has(id)) continue
      seen.add(id)
      const table = schemas.get(projectId)?.find((t) => t.tableName === tableName)
      const nameScore = calculateNameSimilarity(tableName, canonical)
      const matchingPair = similarities.find(
        (p) =>
          (p.projectA === projectId && p.tableA === tableName) ||
          (p.projectB === projectId && p.tableB === tableName)
      )
      const baseScore = matchingPair?.score ?? Math.round(nameScore * 100)
      recs.push({
        id,
        type: 'rename_table',
        title: `Rename ${projectId}.${tableName} → ${canonical}`,
        recommendation: `Rename table "${tableName}" in project "${projectId}" to "${canonical}" to match the standardized naming used across other projects.`,
        affectedTables: [{ projectId, tableName }],
        confidence: scoreToConfidence(baseScore),
        effort: effortFromSize(table),
        priority: baseScore >= HIGH_CONFIDENCE_THRESHOLD ? 1 : 2,
        metadata: { canonicalName: canonical },
      })
    }
  }

  return recs
}

function generateColumnStandardizationRecommendations(
  similarities: SimilarityPair[],
  schemas: Map<string, TableSchema[]>
): Recommendation[] {
  const recs: Recommendation[] = []
  const seen = new Set<string>()

  for (const pair of similarities) {
    if (pair.score < MEDIUM_CONFIDENCE_THRESHOLD) continue
    const tableA = schemas.get(pair.projectA)?.find((t) => t.tableName === pair.tableA)
    const tableB = schemas.get(pair.projectB)?.find((t) => t.tableName === pair.tableB)
    if (!tableA || !tableB) continue

    const namesA = tableA.columns.map((c) => c.name)
    const namesB = tableB.columns.map((c) => c.name)

    for (const colB of namesB) {
      if (namesA.includes(colB)) continue
      const bestMatch = namesA
        .map((colA) => ({ colA, score: calculateNameSimilarity(colA, colB) }))
        .sort((a, b) => b.score - a.score)[0]
      if (bestMatch && bestMatch.score >= 0.55) {
        const id = rid(
          'rename_column',
          pair.projectB,
          pair.tableB,
          colB,
          bestMatch.colA
        )
        if (seen.has(id)) continue
        seen.add(id)
        recs.push({
          id,
          type: 'rename_column',
          title: `Standardize column ${pair.tableB}.${colB} → ${bestMatch.colA}`,
          recommendation: `Rename column "${colB}" on "${pair.projectB}.${pair.tableB}" to "${bestMatch.colA}" to match the standardized column naming in "${pair.projectA}.${pair.tableA}".`,
          affectedTables: [{ projectId: pair.projectB, tableName: pair.tableB }],
          confidence: scoreToConfidence(Math.round(bestMatch.score * 100)),
          effort: effortFromSize(tableB),
          priority: 3,
          metadata: {
            fromColumn: colB,
            toColumn: bestMatch.colA,
          },
        })
      }
    }
  }

  return recs
}

function generateMissingTableRecommendations(
  schemas: Map<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const recs: Recommendation[] = []

  // Determine the union of canonical tables across all projects
  const canonical = new Map<string, { sourceProject: string; table: TableSchema }>()
  // Use union-find on similarity pairs to merge variants into the same canonical
  const parent = new Map<string, string>()
  const key = (projectId: string, tableName: string) => `${projectId}::${tableName}`
  const find = (k: string): string => {
    if (!parent.has(k)) parent.set(k, k)
    let cur = k
    while (parent.get(cur) !== cur) cur = parent.get(cur)!
    return cur
  }
  const union = (a: string, b: string) => {
    const rA = find(a)
    const rB = find(b)
    if (rA !== rB) parent.set(rA, rB)
  }
  for (const [projectId, tables] of schemas) {
    for (const t of tables) find(key(projectId, t.tableName))
  }
  for (const pair of similarities) {
    union(key(pair.projectA, pair.tableA), key(pair.projectB, pair.tableB))
  }

  // Group cluster -> set of projects that have a table in cluster, source table
  const clusters = new Map<string, { projects: Set<string>; sample: TableSchema; canonicalName: string }>()
  for (const [projectId, tables] of schemas) {
    for (const t of tables) {
      const root = find(key(projectId, t.tableName))
      if (!clusters.has(root)) {
        clusters.set(root, {
          projects: new Set([projectId]),
          sample: t,
          canonicalName: t.tableName,
        })
      } else {
        const cluster = clusters.get(root)!
        cluster.projects.add(projectId)
        const candidate = pickCanonicalName([cluster.canonicalName, t.tableName])
        if (candidate !== cluster.canonicalName) {
          cluster.canonicalName = candidate
          cluster.sample = t
        }
      }
    }
  }

  const allProjects = Array.from(schemas.keys())

  for (const cluster of clusters.values()) {
    if (cluster.projects.size === allProjects.length) continue
    // Only suggest addition when cluster covers majority of projects (signals canonical concept)
    if (cluster.projects.size < Math.ceil(allProjects.length / 2)) continue

    for (const projectId of allProjects) {
      if (cluster.projects.has(projectId)) continue
      const id = rid('add_missing_table', projectId, cluster.canonicalName)
      recs.push({
        id,
        type: 'add_missing_table',
        title: `Add missing table ${cluster.canonicalName} to ${projectId}`,
        recommendation: `Project "${projectId}" is missing a "${cluster.canonicalName}" table that exists in ${cluster.projects.size} of ${allProjects.length} projects. Consider adding it for consistency.`,
        affectedTables: [{ projectId, tableName: cluster.canonicalName }],
        confidence: scoreToConfidence(
          Math.round((cluster.projects.size / allProjects.length) * 100)
        ),
        effort: 'medium',
        priority: 2,
        metadata: {
          templateSchema: cluster.sample,
        },
      })
    }
  }

  return recs
}

function generateConsolidationRecommendations(
  similarities: SimilarityPair[],
  schemas: Map<string, TableSchema[]>
): Recommendation[] {
  const recs: Recommendation[] = []
  // Detect intra-project tables that look similar (unusual but possible)
  const perProject = new Map<string, TableSchema[]>()
  for (const [projectId, tables] of schemas) perProject.set(projectId, tables)

  for (const [projectId, tables] of perProject) {
    for (let i = 0; i < tables.length; i++) {
      for (let j = i + 1; j < tables.length; j++) {
        const nameScore = calculateNameSimilarity(tables[i].tableName, tables[j].tableName)
        if (nameScore >= 0.85) {
          recs.push({
            id: rid('consolidate_tables', projectId, tables[i].tableName, tables[j].tableName),
            type: 'consolidate_tables',
            title: `Consolidate ${tables[i].tableName} and ${tables[j].tableName} in ${projectId}`,
            recommendation: `Project "${projectId}" has two similarly-named tables. Consider consolidating them or clarifying their distinct roles.`,
            affectedTables: [
              { projectId, tableName: tables[i].tableName },
              { projectId, tableName: tables[j].tableName },
            ],
            confidence: scoreToConfidence(Math.round(nameScore * 100)),
            effort: 'high',
            priority: 3,
          })
        }
      }
    }
  }
  // Silence "unused" warning — similarities aren't needed here but keep signature uniform
  void similarities
  return recs
}

export function generateRecommendations(
  schemas: Map<string, TableSchema[]>,
  similarities: SimilarityPair[]
): Recommendation[] {
  const all: Recommendation[] = [
    ...generateRenameRecommendations(similarities, schemas),
    ...generateColumnStandardizationRecommendations(similarities, schemas),
    ...generateMissingTableRecommendations(schemas, similarities),
    ...generateConsolidationRecommendations(similarities, schemas),
  ]
  return all.sort((a, b) => a.priority - b.priority || b.confidence - a.confidence)
}
