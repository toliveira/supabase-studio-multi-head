import type { ColumnDefinition, SimilarityBreakdown, TableSchema } from './types'

const SYNONYMS: Record<string, string> = {
  account: 'user',
  accounts: 'user',
  user: 'user',
  users: 'user',
  customer: 'user',
  customers: 'user',
  item: 'product',
  items: 'product',
  product: 'product',
  products: 'product',
  good: 'product',
  goods: 'product',
  order: 'order',
  orders: 'order',
  transaction: 'order',
  transactions: 'order',
  purchase: 'order',
  purchases: 'order',
  message: 'message',
  messages: 'message',
  notification: 'message',
  notifications: 'message',
  log: 'log',
  logs: 'log',
  audit: 'log',
  audits: 'log',
  email: 'email',
  emails: 'email',
  address: 'email',
  username: 'name',
  name: 'name',
  timestamp: 'time',
  time: 'time',
  date: 'time',
  amount: 'amount',
  total: 'amount',
  price: 'amount',
  status: 'status',
  state: 'status',
}

export function tokenize(identifier: string): string[] {
  return identifier
    .toLowerCase()
    .split(/[_\s-]+/)
    .filter(Boolean)
}

export function normalizeToken(token: string): string {
  return SYNONYMS[token] ?? token
}

export function normalizeTokens(tokens: string[]): string[] {
  return tokens.map(normalizeToken)
}

export function levenshtein(a: string, b: string): number {
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

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const v of a) if (b.has(v)) intersection++
  const union = a.size + b.size - intersection
  return union === 0 ? 0 : intersection / union
}

export function calculateNameSimilarity(name1: string, name2: string): number {
  if (name1 === name2) return 1

  const tokens1 = normalizeTokens(tokenize(name1))
  const tokens2 = normalizeTokens(tokenize(name2))
  const tokenSim = jaccard(new Set(tokens1), new Set(tokens2))

  const distance = levenshtein(name1.toLowerCase(), name2.toLowerCase())
  const maxLen = Math.max(name1.length, name2.length)
  const editSim = maxLen === 0 ? 1 : 1 - distance / maxLen

  return tokenSim * 0.7 + editSim * 0.3
}

function normalizeDataType(t: string): string {
  return t
    .toLowerCase()
    .replace(/\(.*?\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

function columnTypeDistribution(cols: ColumnDefinition[]): Map<string, number> {
  const m = new Map<string, number>()
  for (const c of cols) {
    const key = normalizeDataType(c.dataType)
    m.set(key, (m.get(key) ?? 0) + 1)
  }
  return m
}

function distributionSimilarity(a: Map<string, number>, b: Map<string, number>): number {
  if (a.size === 0 && b.size === 0) return 1
  const keys = new Set([...a.keys(), ...b.keys()])
  let totalDiff = 0
  let totalCount = 0
  for (const k of keys) {
    const av = a.get(k) ?? 0
    const bv = b.get(k) ?? 0
    totalDiff += Math.abs(av - bv)
    totalCount += Math.max(av, bv)
  }
  return totalCount === 0 ? 1 : 1 - totalDiff / (2 * totalCount)
}

export function calculateStructureSimilarity(t1: TableSchema, t2: TableSchema): number {
  const colCountSim =
    1 - Math.abs(t1.columns.length - t2.columns.length) / Math.max(t1.columns.length, t2.columns.length, 1)

  const typeSim = distributionSimilarity(
    columnTypeDistribution(t1.columns),
    columnTypeDistribution(t2.columns)
  )

  const pkSim = t1.primaryKey.length === t2.primaryKey.length ? 1 : 0.5

  const fkSim =
    1 -
    Math.abs(t1.foreignKeys.length - t2.foreignKeys.length) /
      Math.max(t1.foreignKeys.length, t2.foreignKeys.length, 1)

  return colCountSim * 0.4 + typeSim * 0.4 + pkSim * 0.1 + fkSim * 0.1
}

function tableNamePrefixes(t: TableSchema): string[] {
  return normalizeTokens(tokenize(t.tableName))
}

function semanticColumnTokens(col: ColumnDefinition, tablePrefixes: string[]): string[] {
  const tokens = normalizeTokens(tokenize(col.name))
  return tokens.filter((tok) => !tablePrefixes.includes(tok) || tokens.length === 1)
}

export function calculateSemanticSimilarity(t1: TableSchema, t2: TableSchema): number {
  const prefixes1 = tableNamePrefixes(t1)
  const prefixes2 = tableNamePrefixes(t2)

  const set1 = new Set<string>()
  for (const c of t1.columns) for (const tok of semanticColumnTokens(c, prefixes1)) set1.add(tok)
  const set2 = new Set<string>()
  for (const c of t2.columns) for (const tok of semanticColumnTokens(c, prefixes2)) set2.add(tok)

  return jaccard(set1, set2)
}

export function similarityBreakdown(t1: TableSchema, t2: TableSchema): SimilarityBreakdown {
  return {
    name: calculateNameSimilarity(t1.tableName, t2.tableName),
    structure: calculateStructureSimilarity(t1, t2),
    semantic: calculateSemanticSimilarity(t1, t2),
  }
}

export function calculateSimilarity(t1: TableSchema, t2: TableSchema): number {
  const b = similarityBreakdown(t1, t2)
  const composite = b.name * 0.4 + b.structure * 0.3 + b.semantic * 0.3
  return Math.round(composite * 100)
}
