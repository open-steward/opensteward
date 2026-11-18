import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawMyCashflowTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawMyCashflowTransaction> = {}): RawMyCashflowTransaction {
  return {
    id: 9001,
    order_id: 1001,
    amount: 59.9,
    currency: 'EUR',
    status: 'paid',
    payment_method: 'paypal',
    kind: 'sale',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (MyCashflow)', () => {
  it('maps id to string canonical id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('9001')
  })

  it('maps order_id to orderId', () => {
    const result = transformTransaction(makeRaw())
    expect(result.orderId).toBe('1001')
  })

  it('converts amount major units to minor units', () => {
    const result = transformTransaction(makeRaw())
    // EUR 2 decimal digits → 59.90 × 100 = 5990
    expect(result.amount).toEqual({ amount: 5990, currency: 'EUR' })
  })

  it('maps paid status to SUCCESS', () => {
    const result = transformTransaction(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformTransaction(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps failed status to FAILURE', () => {
    const result = transformTransaction(makeRaw({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('maps kind=sale to SALE', () => {
    const result = transformTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
  })

  it('maps kind=refund to REFUND', () => {
    const result = transformTransaction(makeRaw({ kind: 'refund' }))
    expect(result.kind).toBe('REFUND')
  })

  it('maps gateway from payment_method', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('paypal')
  })

  it('prefers gateway over payment_method when present', () => {
    const result = transformTransaction(makeRaw({ gateway: 'stripe', payment_method: 'card' }))
    expect(result.gateway).toBe('stripe')
  })

  it('maps processedAt and createdAt from created_at', () => {
    const result = transformTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
  })

  it('uses orderId argument as fallback', () => {
    const result = transformTransaction(makeRaw({ order_id: null }), 'FALLBACK-1001')
    expect(result.orderId).toBe('FALLBACK-1001')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
