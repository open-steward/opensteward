import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AccurateTransaction } from '../../../../../../../src/verticals/accounting/adapters/accurate/transform/transaction'

function makeTransaction(overrides: Partial<AccurateTransaction> = {}): AccurateTransaction {
  return {
    id: 3001,
    date: '2024-04-20',
    description: 'Transfer masuk',
    amount: 5000000,
    currencyCode: 'IDR',
    ...overrides,
  }
}

describe('transformTransaction (accurate)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('3001')
    expect(result.memo).toBe('Transfer masuk')
    expect(result.totalAmount).toBe(5000000)
    expect(result.currency).toBe('IDR')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-04-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles null description', () => {
    const result = transformTransaction(makeTransaction({ description: null }))
    expect(result.memo).toBeUndefined()
  })

  it('handles null currencyCode', () => {
    const result = transformTransaction(makeTransaction({ currencyCode: null }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
