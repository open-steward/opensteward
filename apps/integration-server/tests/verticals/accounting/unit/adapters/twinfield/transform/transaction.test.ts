import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type TwinfieldTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/twinfield/transform/transaction'

function makeTransaction(
  overrides: Partial<TwinfieldTransaction> = {},
): TwinfieldTransaction {
  return {
    code: 'TXN-001',
    number: '20240001',
    date: '2024-06-15',
    currency: 'EUR',
    value: 2500,
    dim1: '1100',
    regime: 'bank',
    origin: 'import',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps code to id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('TXN-001')
  })

  it('maps dim1 to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('1100')
  })

  it('maps regime to type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('bank')
  })

  it('maps number to reference', () => {
    expect(transformTransaction(makeTransaction()).reference).toBe('20240001')
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps value to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(2500)
  })

  it('maps date to createdAt', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-06-15'))
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('returns undefined accountId when dim1 is empty', () => {
    expect(transformTransaction(makeTransaction({ dim1: '' })).accountId).toBeUndefined()
  })

  it('returns undefined type when regime is empty', () => {
    expect(transformTransaction(makeTransaction({ regime: '' })).type).toBeUndefined()
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
