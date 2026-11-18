import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ProsvasisTransaction } from '../../../../../../../src/verticals/accounting/adapters/prosvasis/transform/transaction'

function makeTransaction(overrides: Partial<ProsvasisTransaction> = {}): ProsvasisTransaction {
  return {
    id: '400',
    Date: '2024-03-15',
    Description: 'Bank transfer',
    Amount: 1240,
    Currency: 'EUR',
    ...overrides,
  }
}

describe('transformTransaction (Prosvasis)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('400')
    expect(result.memo).toBe('Bank transfer')
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
    const result = transformTransaction(makeTransaction({ Description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
