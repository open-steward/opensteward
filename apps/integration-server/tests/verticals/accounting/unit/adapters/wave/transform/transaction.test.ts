import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type WaveTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/wave/transform/transaction'

function makeTransaction(overrides: Partial<WaveTransaction> = {}): WaveTransaction {
  return {
    id: 'txn-001',
    accountId: 'acc-1',
    description: 'Office rent payment',
    amount: 2500,
    currency: { code: 'USD' },
    date: '2024-03-01',
    type: 'expense',
    createdAt: '2024-03-01T10:00:00Z',
    modifiedAt: '2024-03-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id from raw id', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-001')
  })

  it('maps accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('acc-1')
  })

  it('maps type', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('expense')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Office rent payment')
  })

  it('maps currency.code to currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(2500)
  })

  it('returns undefined accountId when accountId is empty', () => {
    expect(transformTransaction(makeTransaction({ accountId: '' })).accountId).toBeUndefined()
  })

  it('returns undefined memo when description is empty', () => {
    expect(transformTransaction(makeTransaction({ description: '' })).memo).toBeUndefined()
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
