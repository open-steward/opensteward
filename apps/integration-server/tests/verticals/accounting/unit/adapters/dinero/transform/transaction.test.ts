import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type DineroTransaction } from '../../../../../../../src/verticals/accounting/adapters/dinero/transform/transaction'

function makeTransaction(overrides: Partial<DineroTransaction> = {}): DineroTransaction {
  return {
    Guid: 'txn-guid-001',
    AccountNumber: 1920,
    Type: 'Payment',
    Currency: 'DKK',
    Amount: 5000,
    EntryDate: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps Guid to id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-guid-001')
  })

  it('maps AccountNumber to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1920')
  })

  it('maps Type to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('Payment')
  })

  it('maps Currency to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('DKK')
  })

  it('maps Amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(5000)
  })

  it('maps EntryDate to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when EntryDate is empty', () => {
    expect(transformTransaction(makeTransaction({ EntryDate: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined type when Type is empty', () => {
    expect(transformTransaction(makeTransaction({ Type: '' })).type).toBeUndefined()
  })

  it('returns undefined accountId when AccountNumber is 0', () => {
    expect(transformTransaction(makeTransaction({ AccountNumber: 0 })).accountId).toBeUndefined()
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
