import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type PandleTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/pandle/transform/transaction'

function makeTransaction(overrides: Partial<PandleTransaction> = {}): PandleTransaction {
  return {
    id: 5001,
    date: '2024-03-15',
    amount: 1500,
    transaction_type: 'payment',
    account_id: 1200,
    currency: 'GBP',
    description: 'Client payment received',
    reference: 'TXN-001',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('5001')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1200')
  })

  it('maps transaction_type to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('payment')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('GBP')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1500)
  })

  it('maps description to reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('Client payment received')
  })

  it('maps reference to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('TXN-001')
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined type when transaction_type is empty', () => {
    expect(transformTransaction(makeTransaction({ transaction_type: '' })).type).toBeUndefined()
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
