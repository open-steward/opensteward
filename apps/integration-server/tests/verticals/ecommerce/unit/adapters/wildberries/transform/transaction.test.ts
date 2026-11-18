import { describe, it, expect } from 'vitest'
import { transformTransaction } from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/transaction'
import type { RawWooCommerceOrder } from '../../../../../../../src/verticals/ecommerce/adapters/wildberries/transform/order'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeOrder(overrides: Partial<RawWooCommerceOrder> = {}): RawWooCommerceOrder {
  return {
    id: 500,
    status: 'processing',
    currency: 'USD',
    total: '49.99',
    payment_method: 'stripe',
    date_created_gmt: '2024-07-01T10:00:00Z',
    date_paid_gmt: '2024-07-01T10:01:00Z',
    ...overrides,
  }
}

describe('transformTransaction (Wildberries/WooCommerce)', () => {
  it('builds id as txn-{orderId}', () => {
    const result = transformTransaction(makeOrder())
    expect(result.id).toBe('txn-500')
  })

  it('sets orderId to string version of order id', () => {
    const result = transformTransaction(makeOrder())
    expect(result.orderId).toBe('500')
  })

  it('converts total amount from major to minor units', () => {
    const result = transformTransaction(makeOrder())
    expect(result.amount).toEqual({ amount: 4999, currency: 'USD' })
  })

  it('defaults currency to USD when absent', () => {
    const result = transformTransaction(makeOrder({ currency: undefined }))
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps status "processing" to kind SALE and status SUCCESS', () => {
    const result = transformTransaction(makeOrder({ status: 'processing' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "completed" to kind SALE and status SUCCESS', () => {
    const result = transformTransaction(makeOrder({ status: 'completed' }))
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "refunded" to kind REFUND and status SUCCESS', () => {
    const result = transformTransaction(makeOrder({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps status "cancelled" to kind VOID and status PENDING', () => {
    const result = transformTransaction(makeOrder({ status: 'cancelled' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('PENDING')
  })

  it('maps status "failed" to kind VOID and status FAILURE', () => {
    const result = transformTransaction(makeOrder({ status: 'failed' }))
    expect(result.kind).toBe('VOID')
    expect(result.status).toBe('FAILURE')
  })

  it('maps status "pending" to kind AUTHORIZATION and status PENDING', () => {
    const result = transformTransaction(makeOrder({ status: 'pending' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps status "on-hold" to kind AUTHORIZATION and status PENDING', () => {
    const result = transformTransaction(makeOrder({ status: 'on-hold' }))
    expect(result.kind).toBe('AUTHORIZATION')
    expect(result.status).toBe('PENDING')
  })

  it('maps gateway from payment_method', () => {
    const result = transformTransaction(makeOrder())
    expect(result.gateway).toBe('stripe')
  })

  it('sets processedAt from date_paid_gmt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.processedAt).toBe('2024-07-01T10:01:00Z')
  })

  it('maps createdAt from date_created_gmt', () => {
    const result = transformTransaction(makeOrder())
    expect(result.createdAt).toBe('2024-07-01T10:00:00Z')
  })

  it('sets amount to undefined when total is 0', () => {
    const result = transformTransaction(makeOrder({ total: '0.00' }))
    expect(result.amount).toBeUndefined()
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    expect(() => TransactionSchema.parse(transformTransaction(makeOrder()))).not.toThrow()
  })
})
