import { describe, it, expect } from 'vitest'
import { TransactionSchema } from '../../../../../../../src/verticals/accounting/schema/transaction'
import { transformTransaction, type MaxioTransaction } from '../../../../../../../src/verticals/accounting/adapters/maxio/transform/transaction'

function makeTransaction(overrides: Partial<MaxioTransaction> = {}): MaxioTransaction {
  return {
    id: 9001,
    transaction_type: 'charge',
    memo: 'Subscription charge',
    amount_in_cents: 9900,
    currency: 'USD',
    created_at: '2024-03-15T10:00:00Z',
    subscription_id: 55,
    customer_id: 42,
    ...overrides,
  }
}

describe('transformTransaction (Maxio)', () => {
  it('maps id as string', () => {
    expect(transformTransaction(makeTransaction()).id).toBe('9001')
  })

  it('maps memo', () => {
    expect(transformTransaction(makeTransaction()).memo).toBe('Subscription charge')
  })

  it('converts amount_in_cents to dollars', () => {
    expect(transformTransaction(makeTransaction({ amount_in_cents: 9900 })).totalAmount).toBe(99)
  })

  it('maps currency', () => {
    expect(transformTransaction(makeTransaction()).currency).toBe('USD')
  })

  it('maps contacts from customer_id as string', () => {
    expect(transformTransaction(makeTransaction()).contacts?.[0]?.id).toBe('42')
  })

  it('parses created_at as Date', () => {
    expect(transformTransaction(makeTransaction()).createdAt).toEqual(new Date('2024-03-15T10:00:00Z'))
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
