import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type AkauntingTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/akaunting/transform/transaction'

function makeTransaction(overrides: Partial<AkauntingTransaction> = {}): AkauntingTransaction {
  return {
    id: 601,
    account_id: 301,
    paid_at: '2024-03-15',
    amount: 12500,
    currency_code: 'EUR',
    type: 'income',
    category_id: 5,
    reference: 'TXN-042',
    description: 'Payment received',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('601')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('301')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('income')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('TXN-042')
  })

  it('maps currency_code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(12500)
  })

  it('maps paid_at to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when paid_at is empty', () => {
    expect(transformTransaction(makeTransaction({ paid_at: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined type when type is empty', () => {
    expect(transformTransaction(makeTransaction({ type: '' })).type).toBeUndefined()
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
