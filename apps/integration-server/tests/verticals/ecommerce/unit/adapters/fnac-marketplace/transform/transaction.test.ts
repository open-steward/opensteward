import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawWooCommerceOrderForTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(
  overrides: Partial<RawWooCommerceOrderForTransaction> = {},
): RawWooCommerceOrderForTransaction {
  return {
    id: 9001,
    status: 'processing',
    currency: 'EUR',
    total: '59.99',
    payment_method: 'stripe',
    payment_method_title: 'Stripe',
    transaction_id: 'ch_FNACTEST',
    date_paid_gmt: '2024-03-01T00:00:00Z',
    date_created_gmt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction (FNAC/WooCommerce)', () => {
  it('maps id (same as orderId)', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('9001')
    expect(result.orderId).toBe('9001')
  })

  it('maps processing status → SALE kind / SUCCESS status', () => {
    const result = transformTransaction(makeRaw({ status: 'processing' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps refunded status → REFUND kind / SUCCESS status', () => {
    const result = transformTransaction(makeRaw({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status → PENDING', () => {
    const result = transformTransaction(makeRaw({ status: 'pending' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps failed status → FAILURE', () => {
    const result = transformTransaction(makeRaw({ status: 'failed' }))
    expect(result.status).toBe('FAILURE')
  })

  it('converts total amount from major to minor units (EUR)', () => {
    const result = transformTransaction(makeRaw({ total: '59.99', currency: 'EUR' }))
    expect(result.amount).toEqual({ amount: 5999, currency: 'EUR' })
  })

  it('maps gateway from payment_method', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('stripe')
  })

  it('maps authorizationCode from transaction_id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.authorizationCode).toBe('ch_FNACTEST')
  })

  it('maps processedAt from date_paid_gmt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('stores raw in metadata', () => {
    const raw = makeRaw()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
