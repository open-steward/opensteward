import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type PatriotTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/patriot/transform/transaction'

function makeTransaction(overrides: Partial<PatriotTransaction> = {}): PatriotTransaction {
  return {
    id: 'txn-001',
    date: '2024-03-20',
    amount: 2500,
    type: 'payment',
    account_id: 'acc-100',
    currency: 'USD',
    reference: 'PAY-2024-001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps account_id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-100')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('payment')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(2500)
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('PAY-2024-001')
  })

  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-20'))
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined accountId when empty', () => {
    expect(transformTransaction(makeTransaction({ account_id: '' })).accountId).toBeUndefined()
  })

  it('returns undefined type when empty', () => {
    expect(transformTransaction(makeTransaction({ type: '' })).type).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
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
