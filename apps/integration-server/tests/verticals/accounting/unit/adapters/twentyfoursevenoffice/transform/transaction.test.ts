import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type TwentyFourSevenTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/twentyfoursevenoffice/transform/transaction'

function makeTransaction(overrides: Partial<TwentyFourSevenTransaction> = {}): TwentyFourSevenTransaction {
  return {
    id: 'txn-001',
    date: '2024-03-15',
    amount: 12500,
    type: 'debit',
    accountId: 'acc-1920',
    currency: 'NOK',
    reference: 'REF-42',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-1920')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('debit')
  })

  it('maps reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('REF-42')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(12500)
  })

  it('maps date to createdAt as Date', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.createdAt?.toISOString().startsWith('2024-03-15')).toBe(true)
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined reference when reference is empty', () => {
    expect(transformTransaction(makeTransaction({ reference: '' })).reference).toBeUndefined()
  })

  it('returns undefined type when type is empty', () => {
    expect(transformTransaction(makeTransaction({ type: '' })).type).toBeUndefined()
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
