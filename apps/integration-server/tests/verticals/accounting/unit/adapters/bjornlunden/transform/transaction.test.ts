import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type BlTransaction } from '../../../../../../../src/verticals/accounting/adapters/bjornlunden/transform/transaction'

function makeTransaction(overrides: Partial<BlTransaction> = {}): BlTransaction {
  return {
    Id: 'txn-uuid-1234',
    AccountNumber: 1910,
    TransactionType: 'Payment',
    Currency: 'SEK',
    Amount: 5000,
    TransactionDate: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('txn-uuid-1234')
  })

  it('maps accountNumber as string accountId', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.accountId).toBe('1910')
  })

  it('maps transactionType to type', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.type).toBe('Payment')
  })

  it('maps currency', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.currency).toBe('SEK')
  })

  it('maps amount to totalAmount', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.totalAmount).toBe(5000)
  })

  it('parses transactionDate as Date object', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined for missing date', () => {
    const result = transformTransaction(makeTransaction({ TransactionDate: '' }))
    expect(result.createdAt).toBeUndefined()
  })

  it('returns undefined accountId when AccountNumber is 0', () => {
    const result = transformTransaction(makeTransaction({ AccountNumber: 0 }))
    expect(result.accountId).toBeUndefined()
  })

  it('returns undefined for empty string fields', () => {
    const result = transformTransaction(makeTransaction({ TransactionType: '', Currency: '' }))
    expect(result.type).toBeUndefined()
    expect(result.currency).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
