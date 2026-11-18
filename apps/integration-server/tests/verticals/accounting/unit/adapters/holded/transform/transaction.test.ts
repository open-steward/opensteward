import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type HoldedTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/holded/transform/transaction'

function makeTransaction(overrides: Partial<HoldedTransaction> = {}): HoldedTransaction {
  return {
    id: 'txn-001',
    accountId: 'acc-5700',
    type: 'income',
    reference: 'REF-001',
    description: 'Customer payment',
    currency: 'EUR',
    amount: 12500,
    taxAmount: 2625,
    date: 1710460800, // 2024-03-15
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-5700')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('income')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('REF-001')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Customer payment')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(12500)
  })

  it('maps taxAmount', () => {
    expect(transformTransaction(makeTransaction()).taxAmount).toBe(2625)
  })

  it('maps date (unix timestamp) to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date(1710460800 * 1000))
  })

  it('returns undefined createdAt when date is 0', () => {
    expect(transformTransaction(makeTransaction({ date: 0 })).createdAt).toBeUndefined()
  })

  it('returns undefined memo when description is empty', () => {
    expect(transformTransaction(makeTransaction({ description: '' })).memo).toBeUndefined()
  })

  it('returns undefined reference when reference is empty', () => {
    expect(transformTransaction(makeTransaction({ reference: '' })).reference).toBeUndefined()
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
