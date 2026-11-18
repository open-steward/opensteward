import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type PeakAccountTransaction } from '../../../../../../../src/verticals/accounting/adapters/peakaccount/transform/transaction'

function makeTransaction(overrides: Partial<PeakAccountTransaction> = {}): PeakAccountTransaction {
  return {
    id: 'TXN-001',
    date: '2024-01-20',
    description: 'Payment received',
    amount: 10700,
    currency: 'THB',
    accountId: 'ACC-001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('TXN-001')
    expect(result.memo).toBe('Payment received')
    expect(result.totalAmount).toBe(10700)
    expect(result.currency).toBe('THB')
    expect(result.accountId).toBe('ACC-001')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-01-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformTransaction(makeTransaction({ description: '', currency: '' }))
    expect(result.memo).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
