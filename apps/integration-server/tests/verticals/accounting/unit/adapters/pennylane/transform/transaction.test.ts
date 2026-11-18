import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type PennylaneTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/pennylane/transform/transaction'

function makeTransaction(overrides: Partial<PennylaneTransaction> = {}): PennylaneTransaction {
  return {
    id: 'txn-1',
    date: '2024-11-15',
    label: 'Wire transfer',
    currency: 'EUR',
    amount: 750,
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-1')
  })

  it('maps label to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Wire transfer')
  })

  it('returns undefined memo when label is empty', () => {
    expect(transformTransaction(makeTransaction({ label: '' })).memo).toBeUndefined()
  })

  it('maps currency correctly', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(750)
  })

  it('parses date as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-11-15'))
  })

  it('returns undefined createdAt when date is empty', () => {
    expect(transformTransaction(makeTransaction({ date: '' })).createdAt).toBeUndefined()
  })

  it('passes raw object through as metadata unchanged', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
