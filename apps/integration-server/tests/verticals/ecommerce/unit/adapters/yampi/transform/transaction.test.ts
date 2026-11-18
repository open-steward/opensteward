import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawWooCommerceOrderForTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(
  overrides: Partial<RawWooCommerceOrderForTransaction> = {},
): RawWooCommerceOrderForTransaction {
  return {
    id: 500,
    status: 'processing',
    currency: 'USD',
    total: '49.99',
    payment_method: 'yampi_pay',
    payment_method_title: 'Yampi Pay',
    transaction_id: 'TXN-ABC123',
    date_created_gmt: '2024-07-01T10:00:00Z',
    date_paid_gmt: '2024-07-01T10:01:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Yampi/WooCommerce)', () => {
  it('sets id and orderId to string version of order id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('500')
    expect(result.orderId).toBe('500')
  })

  it('kind is always SALE regardless of order status', () => {
    const statuses = [
      'processing',
      'completed',
      'cancelled',
      'failed',
      'pending',
      'on-hold',
      'refunded',
    ]
    for (const status of statuses) {
      expect(transformTransaction(makeRaw({ status })).kind).toBe('SALE')
    }
  })

  it('maps status "processing" to SUCCESS', () => {
    expect(transformTransaction(makeRaw({ status: 'processing' })).status).toBe('SUCCESS')
  })

  it('maps status "completed" to SUCCESS', () => {
    expect(transformTransaction(makeRaw({ status: 'completed' })).status).toBe('SUCCESS')
  })

  it('maps status "on-hold" to SUCCESS', () => {
    expect(transformTransaction(makeRaw({ status: 'on-hold' })).status).toBe('SUCCESS')
  })

  it('maps status "failed" to FAILURE', () => {
    expect(transformTransaction(makeRaw({ status: 'failed' })).status).toBe('FAILURE')
  })

  it('maps status "cancelled" to FAILURE', () => {
    expect(transformTransaction(makeRaw({ status: 'cancelled' })).status).toBe('FAILURE')
  })

  it('maps status "pending" to PENDING', () => {
    expect(transformTransaction(makeRaw({ status: 'pending' })).status).toBe('PENDING')
  })

  it('converts total amount from major to minor units', () => {
    const result = transformTransaction(makeRaw())
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('defaults currency to USD when absent', () => {
    const result = transformTransaction(makeRaw({ currency: null }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('sets amount to undefined when total is 0', () => {
    const result = transformTransaction(makeRaw({ total: '0.00' }))
    expect(result.amount).toBeUndefined()
  })

  it('maps gateway from payment_method', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('yampi_pay')
  })

  it('maps authorizationCode from transaction_id', () => {
    const result = transformTransaction(makeRaw())
    expect(result.authorizationCode).toBe('TXN-ABC123')
  })

  it('maps processedAt from date_paid_gmt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.processedAt).toBe('2024-07-01T10:01:00Z')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformTransaction(makeRaw())
    expect(result.createdAt).toBe('2024-07-01T10:00:00Z')
  })

  it('includes payment_method_title in metadata', () => {
    const result = transformTransaction(makeRaw())
    expect((result.metadata as Record<string, unknown>)['payment_method_title']).toBe('Yampi Pay')
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeRaw()))).not.toThrow()
  })
})
