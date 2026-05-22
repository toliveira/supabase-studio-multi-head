import type { ColumnDefinition, SimilarityBreakdown, TableSchema } from './types'

const SEMANTIC_GROUPS: string[][] = [
  ['user', 'users', 'account', 'accounts', 'member', 'members', 'profile', 'profiles'],
  ['product', 'products', 'item', 'items', 'sku', 'skus'],
  ['order', 'orders', 'transaction', 'transactions', 'purchase', 'purchases'],
  ['audit', 'audit_log', 'log', 'logs', 'event_log', 'history'],
  ['notification', 'notifications', 'message', 'messages', 'alert', 'alerts'],
  ['email', 'email_address', 'mail'],
  ['name', 'username', 'account_name', 'display_name', 'full_name'],
  ['id', 'identifier', 'uuid'],
  ['created_at', 'created_timestamp', 'inserted_at', 'date_created'],
  ['updated_at', 'updated_timestamp', 'modified_at', 'last_modified'],
  ['amount', 'total_amount', 'price', 'value'],
  ['status', 'state', 'transaction_status'],
  ['description', 'item_description', 'details'],
]

export function normalizeIdentifier(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
}

export function tokenize(value: string): string[] {
  return normalizeIdentifier(value)
    .split('_')
    .filter((part) => part.length > 0)
}

function levenshtein(a: string, b: string): number {
  if (a === b) return 0
  if (a.length === 0) return b.length
  if (b.length === 0) return a.length

  const prev = new Array<number>(b.length + 1)
  const curr = new Array<number>(b.length + 1)
  for (let j = 0; j <= b.length; j++) prev[j] = j

  for (let i = 1; i <= a.length; i++) {
    curr[0] = i
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1
      curr[j] = Math.min(curr[j - 1] + 1, prev[j] + 1, prev[j - 1] + cost)
    }
    for (let j = 0; j <= b.length; j++) prev[j] = curr[j]
  }
  return prev[b.length]
}

function stringSimilarity(a: string, b: string): number {
  if (!a && !b) return 1
  if (!a || !b) return 0
  const maxLen = Math.max(a.length, b.length)
  return 1 - levenshtein(a, b) / maxLen
}

function tokenJaccard(a: string[], b: string[]): number {
  if (a.length === 0 && b.length === 0) return 1
  const setA = new Set(a)
  const setB = new Set(b)
  let intersection = 0
  for (const token of setA) if (setB.has(token)) intersection += 1
  const union = setA.size + setB.size - intersection
  return union === 0 ? 0 : intersection / union
}

function semanticGroupForToken(token: string): number | null {
  for (let i = 0; i < SEMANTIC_GROUPS.length; i++) {
    if (SEMANTIC_GROUPS[i].includes(token)) return i
  }
  return null
}

function tokensShareSemanticGroup(a: string, b: string): boolean {
  if (a === b) return true
  const groupA = semanticGroupForToken(a)
  const groupB = semanticGroupForToken(b)
  return groupA !== null && groupA === groupB
}

export function calculateNameSimilarity(name1: string, name2: string): number {
  if (!name1 || !name2) return 0

  const a = normalizeIdentifier(name1)
  const b = normalizeIdentifier(name2)
  if (a === b) return 1

  const edit = stringSimilarity(a, b)
  const jaccard = tokenJaccard(tokenize(a), tokenize(b))

  // Pluralization tolerance
  const stripPlural = (value: string) => value.replace(/s$/, '')
  const editStripped = stringSimilarity(stripPlural(a), stripPlural(b))

  // Semantic-group boost: if any token of A shares a semantic group with any token of B
  const tokensA = tokenize(a)
  const tokensB = tokenize(b)
  let semanticBoost = 0
  for (const tokenA of tokensA) {
    for (const tokenB of tokensB) {
      if (tokensShareSemanticGroup(tokenA, tokenB)) {
        semanticBoost = Math.max(semanticBoost, 0.6)
      }
    }
  }

  return Math.max(edit, editStripped, jaccard, semanticBoost)
}

function normalizeDataType(dataType: string): string {
  return dataType.toLowerCase().replace(/\([^)]*\)/g, '').trim()
}

function columnFingerprint(column: ColumnDefinition): string {
  return `${normalizeDataType(column.dataType)}|${column.nullable ? 'null' : 'notnull'}`
}

export function calculateStructureSimilarity(
  table1: TableSchema,
  table2: TableSchema
): number {
  const fingerprintsA = table1.columns.map(columnFingerprint)
  const fingerprintsB = table2.columns.map(columnFingerprint)
  const fingerprintScore = tokenJaccard(fingerprintsA, fingerprintsB)

  const pkScore =
    table1.primaryKey.length === 0 && table2.primaryKey.length === 0
      ? 1
      : table1.primaryKey.length === table2.primaryKey.length
        ? 1
        : 0.5

  const fkA = table1.foreignKeys.map((fk) => fk.referencedTable)
  const fkB = table2.foreignKeys.map((fk) => fk.referencedTable)
  const fkScore =
    fkA.length === 0 && fkB.length === 0 ? 1 : tokenJaccard(fkA, fkB)

  return fingerprintScore * 0.7 + pkScore * 0.15 + fkScore * 0.15
}

export function calculateSemanticSimilarity(
  table1: TableSchema,
  table2: TableSchema
): number {
  const nameTokensA = tokenize(table1.tableName)
  const nameTokensB = tokenize(table2.tableName)

  let nameSemantic = 0
  for (const tokenA of nameTokensA) {
    for (const tokenB of nameTokensB) {
      if (tokensShareSemanticGroup(tokenA, tokenB)) {
        nameSemantic = 1
      }
    }
  }

  // Column-level semantic overlap: count columns whose tokens share a semantic group
  const columnsA = table1.columns.map((c) => tokenize(c.name))
  const columnsB = table2.columns.map((c) => tokenize(c.name))

  let matched = 0
  const usedB = new Set<number>()
  for (const tokensA of columnsA) {
    for (let j = 0; j < columnsB.length; j++) {
      if (usedB.has(j)) continue
      const tokensB = columnsB[j]
      const overlap = tokensA.some((tA) =>
        tokensB.some((tB) => tokensShareSemanticGroup(tA, tB))
      )
      if (overlap) {
        matched += 1
        usedB.add(j)
        break
      }
    }
  }
  const denominator = Math.max(columnsA.length, columnsB.length, 1)
  const columnSemantic = matched / denominator

  return nameSemantic * 0.4 + columnSemantic * 0.6
}

export function calculateSimilarity(
  table1: TableSchema,
  table2: TableSchema
): number {
  const breakdown = calculateSimilarityBreakdown(table1, table2)
  return Math.round(
    (breakdown.name * 0.4 + breakdown.structure * 0.4 + breakdown.semantic * 0.2) * 100
  )
}

export function calculateSimilarityBreakdown(
  table1: TableSchema,
  table2: TableSchema
): SimilarityBreakdown {
  return {
    name: calculateNameSimilarity(table1.tableName, table2.tableName),
    structure: calculateStructureSimilarity(table1, table2),
    semantic: calculateSemanticSimilarity(table1, table2),
  }
}
