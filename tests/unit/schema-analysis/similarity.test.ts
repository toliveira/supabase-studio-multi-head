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
  normalizeIdentifier,
  tokenize,
} from '@/lib/schema-analysis/similarity'

describe('normalizeIdentifier', () => {
  it('normalizes mixed case and separators', () => {
    expect(normalizeIdentifier('UserAccount')).toBe('useraccount')
    expect(normalizeIdentifier('User Accounts')).toBe('user_accounts')
    expect(normalizeIdentifier('  __foo__  ')).toBe('foo')
  })
})

describe('tokenize', () => {
  it('splits on underscores', () => {
    expect(tokenize('user_accounts')).toEqual(['user', 'accounts'])
    expect(tokenize('audit_log')).toEqual(['audit', 'log'])
  })
})

describe('calculateNameSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(calculateNameSimilarity('users', 'users')).toBe(1)
  })

  it('returns 0 for empty inputs', () => {
    expect(calculateNameSimilarity('', 'users')).toBe(0)
    expect(calculateNameSimilarity('users', '')).toBe(0)
  })

  it('rewards token overlap', () => {
    expect(calculateNameSimilarity('user_accounts', 'users')).toBeGreaterThan(0.5)
  })

  it('rewards semantic synonyms', () => {
    // orders ↔ transactions share a semantic group
    expect(calculateNameSimilarity('orders', 'transactions')).toBeGreaterThanOrEqual(0.6)
  })

  it('tolerates plural variation', () => {
    expect(calculateNameSimilarity('order', 'orders')).toBeGreaterThan(0.8)
  })
})

describe('calculateStructureSimilarity', () => {
  it('reports 1 (within tolerance) for the same schema', () => {
    const score = calculateStructureSimilarity(PROJECT_A_SCHEMA[0], PROJECT_A_SCHEMA[0])
    expect(score).toBeGreaterThanOrEqual(0.99)
  })

  it('rewards similar column shapes regardless of names', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const accountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
    // Same column shapes (bigint PK, two text not-null UNIQUE, two timestamptz)
    expect(calculateStructureSimilarity(usersA, accountsB)).toBeGreaterThanOrEqual(0.9)
  })
})

describe('calculateSemanticSimilarity', () => {
  it('detects user ↔ user_accounts as semantically similar', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const accountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
    expect(calculateSemanticSimilarity(usersA, accountsB)).toBeGreaterThanOrEqual(0.5)
  })
})

describe('calculateSimilarity', () => {
  it('returns 100 for identical tables', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    expect(calculateSimilarity(usersA, usersA)).toBe(100)
  })

  it('rates users ↔ user_accounts as similar (>75)', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const accountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
    expect(calculateSimilarity(usersA, accountsB)).toBeGreaterThan(75)
  })

  it('rates orders ↔ transactions as similar (>75)', () => {
    const ordersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'orders')!
    const txnsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'transactions')!
    expect(calculateSimilarity(ordersA, txnsB)).toBeGreaterThan(75)
  })

  it('rates users (A) ↔ users (C) as near-identical (>=95)', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const usersC = PROJECT_C_SCHEMA.find((t) => t.tableName === 'users')!
    expect(calculateSimilarity(usersA, usersC)).toBeGreaterThanOrEqual(95)
  })

  it('rates users (A) ↔ products (A) as not similar (<60)', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const productsA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'products')!
    expect(calculateSimilarity(usersA, productsA)).toBeLessThan(60)
  })

  it('handles minimal schemas (project D) without crashing', () => {
    const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
    const usersD = PROJECT_D_SCHEMA.find((t) => t.tableName === 'users')!
    const score = calculateSimilarity(usersA, usersD)
    expect(score).toBeGreaterThan(50)
    expect(score).toBeLessThanOrEqual(100)
  })
})
