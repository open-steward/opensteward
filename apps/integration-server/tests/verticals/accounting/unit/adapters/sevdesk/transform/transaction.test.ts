import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import {
  transformTransaction,
  type SevDeskTransaction,
} from '../../../../../../../src/verticals/accounting/adapters/sevdesk/transform/transaction'

function makeTransaction(overrides: Partial<SevDeskTransaction> = {}): SevDeskTransaction {
  return {
    id: 'txn-1',
    amount: 1190,
    date: '2024-10-01',
    paymentMethod: { id: 'pm-1', objectName: 'PaymentMethod' },
    checkAccount: { id: 'ca-1' },
    valueDate: '2024-10-01',
    description: 'Invoice payment',
    type: 'DEBIT',
    currency: 'EUR',
    entryDate: '2024-10-02',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id correctly', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('txn-1')
  })

  it('maps checkAccount id to accountId', () => {
    expect(transformTransaction(makeTransaction()).accountId).toBe('ca-1')
  })

  it('maps type correctly', () => {
    expect(transformTransaction(makeTransaction()).type).toBe('DEBIT')
  })

  it('maps description to memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Invoice payment')
  })

  it('maps currency correctly', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('EUR')
  })

  it('maps amount to totalAmount', () => {
    expect(transformTransaction(makeTransaction()).totalAmount).toBe(1190)
  })

  it('parses entryDate as createdAt Date object', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-10-02'))
  })

  it('produces one lineitem with totalAmount', () => {
    const t = transformTransaction(makeTransaction())
    expect(t.lineItems).toHaveLength(1)
    expect(t.lineItems![0].totalAmount).toBe(1190)
  })

  it('handles null checkAccount', () => {
    expect(transformTransaction(makeTransaction({ checkAccount: null })).accountId).toBeUndefined()
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
