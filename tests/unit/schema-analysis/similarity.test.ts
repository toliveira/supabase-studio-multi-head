import { describe, expect, it } from 'vitest'

import {
  PROJECT_A_SCHEMA,
  PROJECT_B_SCHEMA,
  PROJECT_C_SCHEMA,
  PROJECT_D_SCHEMA,
} from '@/lib/schema-analysis/__mocks__/data'
import {
  calculateNameSimilarity,
  calculateSemanticSimilarity,
  calculateSimilarity,
  calculateStructureSimilarity,
  classifySimilarity,
} from '@/lib/schema-analysis/similarity'
import type { TableSchema } from '@/lib/schema-analysis/types'

const findTable = (schemas: TableSchema[], name: string): TableSchema => {
  const t = schemas.find((s) => s.tableName === name)
  if (!t) throw new Error(`Table ${name} not found in fixture`)
  return t
}

const usersA = findTable(PROJECT_A_SCHEMA, 'users')
const productsA = findTable(PROJECT_A_SCHEMA, 'products')
const ordersA = findTable(PROJECT_A_SCHEMA, 'orders')
const auditLogA = findTable(PROJECT_A_SCHEMA, 'audit_log')

const userAccountsB = findTable(PROJECT_B_SCHEMA, 'user_accounts')
const itemsB = findTable(PROJECT_B_SCHEMA, 'items')
const transactionsB = findTable(PROJECT_B_SCHEMA, 'transactions')

const usersC = findTable(PROJECT_C_SCHEMA, 'users')
const notificationsC = findTable(PROJECT_C_SCHEMA, 'notifications')

const usersD = findTable(PROJECT_D_SCHEMA, 'users')

describe('calculateNameSimilarity', () => {
  it('returns 100 for exact match', () => {
    expect(calculateNameSimilarity('users', 'users')).toBe(100)
  })

  it('is case-insensitive', () => {
    expect(calculateNameSimilarity('Users', 'USERS')).toBe(100)
  })

  it('treats underscores/hyphens as separators', () => {
    expect(calculateNameSimilarity('user_accounts', 'useraccounts')).toBe(100)
    expect(calculateNameSimilarity('audit-log', 'audit_log')).toBe(100)
  })

  it('returns 90 for known table synonyms', () => {
    expect(calculateNameSimilarity('users', 'user_accounts')).toBe(90)
    expect(calculateNameSimilarity('products', 'items')).toBe(90)
    expect(calculateNameSimilarity('orders', 'transactions')).toBe(90)
  })

  it('returns a partial score (>30, <90) for similar but non-synonym names', () => {
    const score = calculateNameSimilarity('product', 'products_v2')
    expect(score).toBeGreaterThan(30)
    expect(score).toBeLessThan(90)
  })

  it('returns a low score (<30) for completely different names', () => {
    expect(calculateNameSimilarity('users', 'xyzqqq')).toBeLessThan(30)
  })
})

describe('calculateStructureSimilarity', () => {
  it('returns 100 for identical structures', () => {
    expect(calculateStructureSimilarity(usersA, usersA)).toBe(100)
  })

  it('returns >=95 for near-identical structures (only differing in indexes)', () => {
    expect(calculateStructureSimilarity(usersA, usersC)).toBeGreaterThanOrEqual(95)
  })

  it('returns >60 for tables with the same structure but different column names (via synonyms)', () => {
    const score = calculateStructureSimilarity(usersA, userAccountsB)
    expect(score).toBeGreaterThan(60)
  })

  it('returns <100 but >40 when one table is a subset of the other', () => {
    const score = calculateStructureSimilarity(usersA, usersD)
    expect(score).toBeLessThan(100)
    expect(score).toBeGreaterThan(40)
  })

  it('returns <60 for largely different tables (audit_log vs notifications)', () => {
    expect(calculateStructureSimilarity(auditLogA, notificationsC)).toBeLessThan(60)
  })
})

describe('calculateSemanticSimilarity', () => {
  it('returns >50 for tables with similar FK patterns', () => {
    expect(calculateSemanticSimilarity(ordersA, transactionsB)).toBeGreaterThan(50)
  })

  it('returns >50 for tables with the same data type distribution', () => {
    expect(calculateSemanticSimilarity(productsA, itemsB)).toBeGreaterThan(50)
  })
})

describe('calculateSimilarity (composite)', () => {
  it('returns a high score (>75) for users vs user_accounts', () => {
    const { score } = calculateSimilarity(usersA, userAccountsB)
    expect(score).toBeGreaterThan(75)
  })

  it('returns an exact-tier score (>=90) for identical tables', () => {
    const { score, classification } = calculateSimilarity(usersA, usersC)
    expect(score).toBeGreaterThanOrEqual(90)
    expect(classification).toBe('exact')
  })

  it('returns a low score (<50) for unrelated tables', () => {
    const { score, classification } = calculateSimilarity(auditLogA, notificationsC)
    expect(score).toBeLessThan(50)
    expect(classification).toBe('different')
  })

  it('exposes a breakdown with name/structure/semantic components', () => {
    const result = calculateSimilarity(usersA, userAccountsB)
    expect(result.breakdown).toHaveProperty('name')
    expect(result.breakdown).toHaveProperty('structure')
    expect(result.breakdown).toHaveProperty('semantic')
    expect(result.breakdown.name).toBeGreaterThanOrEqual(0)
    expect(result.breakdown.name).toBeLessThanOrEqual(100)
  })
})

describe('classifySimilarity', () => {
  it('classifies >=90 as exact', () => {
    expect(classifySimilarity(100)).toBe('exact')
    expect(classifySimilarity(90)).toBe('exact')
  })

  it('classifies [75, 90) as likely_similar', () => {
    expect(classifySimilarity(89.9)).toBe('likely_similar')
    expect(classifySimilarity(75)).toBe('likely_similar')
  })

  it('classifies [50, 75) as partial', () => {
    expect(classifySimilarity(74.9)).toBe('partial')
    expect(classifySimilarity(50)).toBe('partial')
  })

  it('classifies <50 as different', () => {
    expect(classifySimilarity(49.9)).toBe('different')
    expect(classifySimilarity(0)).toBe('different')
  })
})
