import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FreeeBankTransaction } from '../../../../../../../src/verticals/accounting/adapters/freee/transform/transaction'

function makeRaw(overrides: Partial<FreeeBankTransaction> = {}): FreeeBankTransaction {
  return {
    id: 8001,
    date: '2024-06-15',
    amount: 3000,
    description: 'Payment received',
    balance: 50000,
    ...overrides,
  }
}

describe('transformTransaction (freee)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('8001')
    expect(result.totalAmount).toBe(3000)
    expect(result.memo).toBe('Payment received')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toEqual(new Date('2024-06-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('creates lineitem from transaction', () => {
    const result = transformTransaction(makeRaw())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0].totalAmount).toBe(3000)
    expect(result.lineItems![0].description).toBe('Payment received')
  })

  it('handles null description', () => {
    const result = transformTransaction(makeRaw({ description: null }))
    expect(result.memo).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
