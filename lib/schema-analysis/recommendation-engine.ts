import { buildMatrix } from './matrix'
import { calculateNameSimilarity } from './similarity'
import type { Recommendation, SimilarityPair, TableSchema } from './types'

const RENAME_THRESHOLD = 75
const COLUMN_RENAME_THRESHOLD = 0.6

function effortFromRowCount(rowCount: number): 'low' | 'medium' | 'high' {
  if (rowCount < 1000) return 'low'
  if (rowCount < 100_000) return 'medium'
  return 'high'
}

function maxEffort(a: 'low' | 'medium' | 'high', b: 'low' | 'medium' | 'high'): 'low' | 'medium' | 'high' {
  const rank = { low: 0, medium: 1, high: 2 }
  return rank[a] >= rank[b] ? a : b
}

function findTable(schemas: Map<string, TableSchema[]>, projectId: string, tableName: string): TableSchema | undefined {
  return schemas.get(projectId)?.find((t) => t.tableName === tableName)
}

function generateRenameRecommendations(
  schemas: Map<string, TableSchema[]>,
  pairs: SimilarityPair[]
): Recommendation[] {
  const recs: Recommendation[] = []
  const seenPairs = new Set<string>()

  const sorted = [...pairs].sort((a, b) => b.score - a.score)
  for (const pair of sorted) {
    if (pair.score < RENAME_THRESHOLD) continue
    if (pair.tableA === pair.tableB) continue
    const key = [pair.projectA, pair.tableA, pair.projectB, pair.tableB].sort().join('|')
    if (seenPairs.has(key)) continue
    seenPairs.add(key)

    const tableA = findTable(schemas, pair.projectA, pair.tableA)
    const tableB = findTable(schemas, pair.projectB, pair.tableB)
    if (!tableA || !tableB) continue

    const aFrequency = countTableName(schemas, pair.tableA)
    const bFrequency = countTableName(schemas, pair.tableB)
    const canonical = aFrequency >= bFrequency ? pair.tableA : pair.tableB
    const fromProject = canonical === pair.tableA ? pair.projectB : pair.projectA
    const fromName = canonical === pair.tableA ? pair.tableB : pair.tableA
    const source = canonical === pair.tableA ? tableB : tableA

    recs.push({
      id: `rename-table:${fromProject}:${fromName}->${canonical}`,
      type: 'rename_table',
      affectedTables: [{ projectId: fromProject, tableName: fromName }],
      recommendation: `Rename table "${fromName}" to "${canonical}" in project ${fromProject}`,
      rationale: `Similarity ${pair.score}% with ${pair.projectA === fromProject ? pair.projectB : pair.projectA}.${canonical}. Canonical name "${canonical}" appears in ${Math.max(aFrequency, bFrequency)} project(s).`,
      confidence: Math.min(1, pair.score / 100),
      effort: effortFromRowCount(source.rowCount),
      details: {
        fromTable: fromName,
        toTable: canonical,
        score: pair.score,
        breakdown: pair.breakdown,
      },
    })

    const columnRecs = generateColumnRenameRecommendations(source, canonical === pair.tableA ? tableA : tableB, fromProject)
    recs.push(...columnRecs)
  }

  return recs
}

function generateColumnRenameRecommendations(
  variant: TableSchema,
  canonical: TableSchema,
  fromProject: string
): Recommendation[] {
  const recs: Recommendation[] = []
  const canonicalNames = new Set(canonical.columns.map((c) => c.name))

  for (const col of variant.columns) {
    if (canonicalNames.has(col.name)) continue
    let bestMatch: { name: string; score: number } | null = null
    for (const cc of canonical.columns) {
      const score = calculateNameSimilarity(col.name, cc.name)
      if (score >= COLUMN_RENAME_THRESHOLD && (!bestMatch || score > bestMatch.score)) {
        bestMatch = { name: cc.name, score }
      }
    }
    if (!bestMatch) continue
    recs.push({
      id: `rename-column:${fromProject}:${variant.tableName}:${col.name}->${bestMatch.name}`,
      type: 'rename_column',
      affectedTables: [{ projectId: fromProject, tableName: variant.tableName }],
      recommendation: `Rename column "${col.name}" to "${bestMatch.name}" in ${fromProject}.${variant.tableName}`,
      rationale: `Column name similarity ${Math.round(bestMatch.score * 100)}% with canonical column "${bestMatch.name}".`,
      confidence: bestMatch.score,
      effort: effortFromRowCount(variant.rowCount),
      details: {
        fromColumn: col.name,
        toColumn: bestMatch.name,
        score: bestMatch.score,
      },
    })
  }

  return recs
}

function countTableName(schemas: Map<string, TableSchema[]>, name: string): number {
  let count = 0
  for (const tables of schemas.values()) if (tables.some((t) => t.tableName === name)) count++
  return count
}

function generateAdditionRecommendations(schemas: Map<string, TableSchema[]>, pairs: SimilarityPair[]): Recommendation[] {
  const matrix = buildMatrix(schemas, pairs)
  const recs: Recommendation[] = []
  const totalProjects = matrix.projects.length

  for (const canonical of matrix.canonicalTables) {
    const projectsWithTable = matrix.cells
      .filter((c) => c.canonicalTable === canonical && c.status !== 'missing')
      .map((c) => ({ projectId: c.projectId, actualTableName: c.actualTableName! }))
    const presence = projectsWithTable.length / totalProjects
    if (presence < 0.5) continue
    const missingProjects = matrix.cells
      .filter((c) => c.canonicalTable === canonical && c.status === 'missing')
      .map((c) => c.projectId)
    if (missingProjects.length === 0) continue

    const referenceProjectId = projectsWithTable.find((p) => p.actualTableName === canonical)?.projectId ?? projectsWithTable[0].projectId
    const reference = findTable(schemas, referenceProjectId, canonical) ?? findTable(schemas, projectsWithTable[0].projectId, projectsWithTable[0].actualTableName)

    for (const missingProject of missingProjects) {
      recs.push({
        id: `add-table:${missingProject}:${canonical}`,
        type: 'add_missing_table',
        affectedTables: [{ projectId: missingProject, tableName: canonical }],
        recommendation: `Add missing table "${canonical}" to project ${missingProject}`,
        rationale: `"${canonical}" exists in ${projectsWithTable.length} of ${totalProjects} projects (${Math.round(presence * 100)}%).`,
        confidence: Math.min(1, 0.7 + presence * 0.3),
        effort: 'low',
        details: {
          tableName: canonical,
          referenceProject: referenceProjectId,
          referenceSchema: reference,
        },
      })
    }
  }
  return recs
}

function generateConsolidationRecommendations(
  schemas: Map<string, TableSchema[]>,
  pairs: SimilarityPair[]
): Recommendation[] {
  const groups = new Map<string, Set<string>>()
  const projectsByGroup = new Map<string, Set<string>>()

  for (const p of pairs) {
    if (p.score < 90) continue
    if (p.tableA !== p.tableB) continue
    const set = groups.get(p.tableA) ?? new Set<string>()
    set.add(`${p.projectA}::${p.tableA}`)
    set.add(`${p.projectB}::${p.tableB}`)
    groups.set(p.tableA, set)
    const projects = projectsByGroup.get(p.tableA) ?? new Set<string>()
    projects.add(p.projectA)
    projects.add(p.projectB)
    projectsByGroup.set(p.tableA, projects)
  }

  const recs: Recommendation[] = []
  for (const [tableName, projects] of projectsByGroup) {
    if (projects.size < 3) continue
    recs.push({
      id: `consolidate:${tableName}`,
      type: 'consolidate_tables',
      affectedTables: [...projects].map((projectId) => ({ projectId, tableName })),
      recommendation: `Standardize "${tableName}" schema across ${projects.size} projects`,
      rationale: `Table "${tableName}" appears with >=90% similarity in ${projects.size} projects. Consolidation would unify the schema for cross-project tooling.`,
      confidence: 0.85,
      effort: [...projects].reduce<'low' | 'medium' | 'high'>((acc, projectId) => {
        const t = findTable(schemas, projectId, tableName)
        return t ? maxEffort(acc, effortFromRowCount(t.rowCount)) : acc
      }, 'low'),
      details: { tableName, projects: [...projects] },
    })
  }
  return recs
}

export function generateRecommendations(
  schemas: Map<string, TableSchema[]>,
  pairs: SimilarityPair[]
): Recommendation[] {
  const recs = [
    ...generateRenameRecommendations(schemas, pairs),
    ...generateAdditionRecommendations(schemas, pairs),
    ...generateConsolidationRecommendations(schemas, pairs),
  ]

  const seen = new Set<string>()
  const deduped: Recommendation[] = []
  for (const r of recs) {
    if (seen.has(r.id)) continue
    seen.add(r.id)
    deduped.push(r)
  }
  return deduped.sort((a, b) => b.confidence - a.confidence)
}
