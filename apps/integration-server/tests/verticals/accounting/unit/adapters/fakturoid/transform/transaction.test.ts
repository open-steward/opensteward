import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type FakturoidTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/fakturoid/transform/transaction'

function makeTransaction(overrides: Partial<FakturoidTransaction> = {}): FakturoidTransaction {
  return {
    id: 601,
    account_id: 221,
    date: '2024-03-15',
    amount: 25000,
    currency: 'CZK',
    type: 'debit',
    description: 'Bank transfer received',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('601')
  })

  it('maps account_id to accountId as string', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('221')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('debit')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('CZK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(25000)
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined type when empty', () => {
    expect(transformTransaction(makeTransaction({ type: '' })).type).toBeUndefined()
  })

  it('returns undefined accountId when account_id is 0', () => {
    expect(transformTransaction(makeTransaction({ account_id: 0 })).accountId).toBeUndefined()
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
