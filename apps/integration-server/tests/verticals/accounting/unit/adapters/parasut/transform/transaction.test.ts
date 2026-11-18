import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type ParasutTransaction } from '../../../../../../../src/verticals/accounting/adapters/parasut/transform/transaction'

function makeTransaction(overrides: Partial<ParasutTransaction> = {}): ParasutTransaction {
  return {
    id: 'txn_1',
    type: 'bank_fees',
    attributes: {
      description: 'Bank fee',
      amount: 150,
      date: '2024-03-10',
      currency: 'TRY',
    },
    ...overrides,
  }
}

describe('transformTransaction (parasut)', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn_1')
  })

  it('maps memo from description', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Bank fee')
  })

  it('maps totalAmount from amount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(150)
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('TRY')
  })

  it('parses date as Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-10'))
  })

  it('passes raw object as metadata', () => {
    const raw = makeTransaction()
    expect(transformTransaction(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw: ParasutTransaction = { id: 'txn_2', type: 'bank_fees', attributes: {} }
    const t = transformTransaction(raw)
    expect(t.id).toBe('txn_2')
    expect(t.memo).toBeUndefined()
    expect(t.totalAmount).toBeUndefined()
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
