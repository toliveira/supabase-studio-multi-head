import { describe, expect, it } from 'vitest'

import { PROJECT_A_SCHEMA, PROJECT_B_SCHEMA, PROJECT_D_SCHEMA } from '@/lib/schema-analysis/__mocks__/data'
import {
  calculateNameSimilarity,
  calculateSemanticSimilarity,
  calculateSimilarity,
  calculateStructureSimilarity,
  levenshtein,
  normalizeToken,
  tokenize,
} from '@/lib/schema-analysis/similarity'

const usersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'users')!
const usersD = PROJECT_D_SCHEMA.find((t) => t.tableName === 'users')!
const accountsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'user_accounts')!
const itemsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'items')!
const productsA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'products')!
const ordersA = PROJECT_A_SCHEMA.find((t) => t.tableName === 'orders')!
const transactionsB = PROJECT_B_SCHEMA.find((t) => t.tableName === 'transactions')!

describe('tokenize / normalizeToken', () => {
  it('tokenizes snake_case identifiers', () => {
    expect(tokenize('user_accounts')).toEqual(['user', 'accounts'])
  })

  it('maps synonyms to canonical token', () => {
    expect(normalizeToken('items')).toBe('product')
    expect(normalizeToken('transaction')).toBe('order')
  })
})

describe('levenshtein', () => {
  it('returns 0 for identical strings', () => {
    expect(levenshtein('abc', 'abc')).toBe(0)
  })

  it('counts single substitution', () => {
    expect(levenshtein('abc', 'abd')).toBe(1)
  })

  it('handles empty strings', () => {
    expect(levenshtein('', 'abc')).toBe(3)
    expect(levenshtein('abc', '')).toBe(3)
  })
})

describe('calculateNameSimilarity', () => {
  it('returns 1 for identical names', () => {
    expect(calculateNameSimilarity('users', 'users')).toBe(1)
  })

  it('scores synonym pairs high', () => {
    expect(calculateNameSimilarity('users', 'user_accounts')).toBeGreaterThan(0.6)
    expect(calculateNameSimilarity('products', 'items')).toBeGreaterThan(0.6)
    expect(calculateNameSimilarity('orders', 'transactions')).toBeGreaterThan(0.6)
  })

  it('scores unrelated names low', () => {
    expect(calculateNameSimilarity('users', 'audit_log')).toBeLessThan(0.4)
  })
})

describe('calculateStructureSimilarity', () => {
  it('scores identical schemas at 1', () => {
    expect(calculateStructureSimilarity(usersA, usersA)).toBe(1)
  })

  it('scores variant schemas moderately high', () => {
    const score = calculateStructureSimilarity(usersA, accountsB)
    expect(score).toBeGreaterThan(0.8)
  })

  it('scores minimal schemas lower than full match', () => {
    const variant = calculateStructureSimilarity(usersA, usersD)
    expect(variant).toBeLessThan(1)
    expect(variant).toBeGreaterThan(0.4)
  })
})

describe('calculateSemanticSimilarity', () => {
  it('detects shared column semantics across renames', () => {
    expect(calculateSemanticSimilarity(usersA, accountsB)).toBeGreaterThan(0.5)
    expect(calculateSemanticSimilarity(productsA, itemsB)).toBeGreaterThan(0.5)
  })
})

describe('calculateSimilarity (composite)', () => {
  it('returns 100 for self-comparison', () => {
    expect(calculateSimilarity(usersA, usersA)).toBe(100)
  })

  it('flags users vs user_accounts as similar (>=75)', () => {
    expect(calculateSimilarity(usersA, accountsB)).toBeGreaterThanOrEqual(75)
  })

  it('flags orders vs transactions as similar (>=75)', () => {
    expect(calculateSimilarity(ordersA, transactionsB)).toBeGreaterThanOrEqual(75)
  })

  it('flags products vs items as similar (>=75)', () => {
    expect(calculateSimilarity(productsA, itemsB)).toBeGreaterThanOrEqual(75)
  })

  it('does not falsely flag users vs orders', () => {
    expect(calculateSimilarity(usersA, ordersA)).toBeLessThan(75)
  })

  it('returns integer 0-100', () => {
    const score = calculateSimilarity(productsA, itemsB)
    expect(Number.isInteger(score)).toBe(true)
    expect(score).toBeGreaterThanOrEqual(0)
    expect(score).toBeLessThanOrEqual(100)
  })
})
