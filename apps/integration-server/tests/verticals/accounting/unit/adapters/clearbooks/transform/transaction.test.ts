import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ClearBooksTransaction } from '../../../../../../../src/verticals/accounting/adapters/clearbooks/transform/transaction'

function makeTransaction(overrides: Partial<ClearBooksTransaction> = {}): ClearBooksTransaction {
  return {
    transaction_id: '701',
    date: '10/03/2024',
    description: 'Bank transfer',
    amount: 1500,
    currency: 'GBP',
    ...overrides,
  }
}

describe('transformTransaction (ClearBooks)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('701')
    expect(result.memo).toBe('Bank transfer')
    expect(result.totalAmount).toBe(1500)
    expect(result.currency).toBe('GBP')
  })

  it('parses UK date format DD/MM/YYYY', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('converts numeric transaction_id to string', () => {
    const result = transformTransaction(makeTransaction({ transaction_id: 999 }))
    expect(result.id).toBe('999')
  })

  it('handles missing description gracefully', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('handles ISO date format', () => {
    const result = transformTransaction(makeTransaction({ date: '2024-03-10' }))
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
