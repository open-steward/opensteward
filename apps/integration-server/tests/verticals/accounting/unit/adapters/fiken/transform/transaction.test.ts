import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type FikenTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/fiken/transform/transaction'

function makeTransaction(overrides: Partial<FikenTransaction> = {}): FikenTransaction {
  return {
    transactionId: 601,
    date: '2024-06-20',
    description: 'Payment received',
    type: 'PAYMENT',
    accountCode: '1920',
    amount: 5000,
    currency: 'NOK',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps transactionId to id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('601')
  })

  it('maps accountCode to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1920')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('PAYMENT')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('NOK')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(5000)
  })

  it('maps date to createdAt as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-06-20'))
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined accountId when accountCode is empty', () => {
    expect(transformTransaction(makeTransaction({ accountCode: '' })).accountId).toBeUndefined()
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
