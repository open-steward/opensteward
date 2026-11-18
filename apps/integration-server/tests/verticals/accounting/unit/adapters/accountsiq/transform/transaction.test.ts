import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type AccountsIQTransaction } from '../../../../../../../src/verticals/accounting/adapters/accountsiq/transform/transaction'

function makeTransaction(overrides: Partial<AccountsIQTransaction> = {}): AccountsIQTransaction {
  return {
    transactionId: '400',
    entityId: '10',
    transactionDate: '2024-03-20',
    description: 'BACS payment received',
    totalAmount: 12000,
    currency: 'GBP',
    ...overrides,
  }
}

describe('transformTransaction (AccountsIQ)', () => {
  it('maps core fields correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('400')
    expect(result.memo).toBe('BACS payment received')
    expect(result.totalAmount).toBe(12000)
    expect(result.currency).toBe('GBP')
  })

  it('parses transactionDate as createdAt Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-20'))
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('returns undefined memo when description is empty', () => {
    const result = transformTransaction(makeTransaction({ description: '' }))
    expect(result.memo).toBeUndefined()
  })

  it('returns undefined currency when currency is empty', () => {
    const result = transformTransaction(makeTransaction({ currency: '' }))
    expect(result.currency).toBeUndefined()
  })

  it('returns undefined createdAt when transactionDate is empty', () => {
    const result = transformTransaction(makeTransaction({ transactionDate: '' }))
    expect(result.createdAt).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
