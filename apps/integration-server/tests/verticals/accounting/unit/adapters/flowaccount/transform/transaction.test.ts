import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type FlowAccountTransaction } from '../../../../../../../src/verticals/accounting/adapters/flowaccount/transform/transaction'

function makeTransaction(overrides: Partial<FlowAccountTransaction> = {}): FlowAccountTransaction {
  return {
    id: 400,
    transactionDate: '2024-01-22',
    description: 'Customer payment',
    amount: 10700,
    currencyCode: 'THB',
    accountId: 'ACC-1001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('400')
    expect(result.memo).toBe('Customer payment')
    expect(result.totalAmount).toBe(10700)
    expect(result.currency).toBe('THB')
    expect(result.accountId).toBe('ACC-1001')
  })

  it('parses date as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-01-22'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const result = transformTransaction(makeTransaction({ description: '', currencyCode: '' }))
    expect(result.memo).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
