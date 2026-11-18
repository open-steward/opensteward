import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type BexioTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/bexio/transform/transaction'

function makeTransaction(overrides: Partial<BexioTransaction> = {}): BexioTransaction {
  return {
    id: 801,
    date: '2024-04-15',
    account_id: 1020,
    type: 'payment',
    reference: 'PAY-001',
    memo: 'Invoice payment',
    currency_code: 'CHF',
    total_amount: 1500,
    tax_amount: 115,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('801')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1020')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('payment')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('PAY-001')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Invoice payment')
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('CHF')
  })

  it('maps total_amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1500)
  })

  it('maps tax_amount to taxAmount', () => {
    expect(transformTransaction(makeTransaction()).taxAmount).toBe(115)
  })

  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-04-15'))
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined type when empty', () => {
    expect(transformTransaction(makeTransaction({ type: '' })).type).toBeUndefined()
  })

  it('returns undefined reference when empty', () => {
    expect(transformTransaction(makeTransaction({ reference: '' })).reference).toBeUndefined()
  })

  it('returns undefined memo when empty', () => {
    expect(transformTransaction(makeTransaction({ memo: '' })).memo).toBeUndefined()
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
