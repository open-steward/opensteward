import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FoundationTransaction } from '../../../../../../../src/verticals/accounting/adapters/foundation/transform/transaction'

function makeTransaction(overrides: Partial<FoundationTransaction> = {}): FoundationTransaction {
  return {
    TransactionId: 'TXN-001',
    TransactionDate: '2024-03-10',
    Description: 'Payment received',
    Amount: 5000,
    Currency: 'USD',
    JobNumber: 'JOB-100',
    ...overrides,
  }
}

describe('transformTransaction (Foundation)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('TXN-001')
    expect(result.memo).toBe('Payment received')
    expect(result.totalAmount).toBe(5000)
    expect(result.currency).toBe('USD')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing description gracefully', () => {
    const result = transformTransaction(makeTransaction({ Description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('handles missing currency gracefully', () => {
    const result = transformTransaction(makeTransaction({ Currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
