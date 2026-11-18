import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type CenterTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/center/transform/transaction'

function makeTransaction(overrides: Partial<CenterTransaction> = {}): CenterTransaction {
  return {
    id: 'txn-001',
    accountId: 'acc-1000',
    type: 'income',
    reference: 'REF-001',
    description: 'Customer payment',
    currency: 'USD',
    amount: 12500,
    taxAmount: 625,
    createdAt: '2024-03-15',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-1000')
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
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(12500)
  })

  it('maps taxAmount', () => {
    expect(transformTransaction(makeTransaction()).taxAmount).toBe(625)
  })

  it('maps createdAt (ISO string) to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt).toEqual(new Date('2024-03-15'))
  })

  it('returns undefined createdAt when createdAt is empty', () => {
    expect(transformTransaction(makeTransaction({ createdAt: '' })).createdAt).toBeUndefined()
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
