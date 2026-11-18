import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type EpsilonNetTransaction } from '../../../../../../../src/verticals/accounting/adapters/epsilonnet/transform/transaction'

function makeTransaction(overrides: Partial<EpsilonNetTransaction> = {}): EpsilonNetTransaction {
  return {
    id: '400',
    date: '2024-03-15',
    description: 'Payment received',
    amount: 1240,
    currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction (EpsilonNet)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('400')
    expect(result.memo).toBe('Payment received')
    expect(result.totalAmount).toBe(1240)
    expect(result.currency).toBe('EUR')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing description gracefully', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
