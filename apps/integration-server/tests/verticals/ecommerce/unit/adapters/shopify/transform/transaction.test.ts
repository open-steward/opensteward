import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopify/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeTransaction(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 6001,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '108.24',
    currency: 'USD',
    gateway: 'shopify_payments',
    authorization: 'AUTH_1234',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-05-01T10:00:05Z',
    created_at: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps kind and status to canonical enums', () => {
    const result = transformTransaction(makeTransaction())
    expect(result.id).toBe('6001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
    expect(result.gateway).toBe('shopify_payments')
    expect(result.authorizationCode).toBe('AUTH_1234')
    expect(result.amount).toEqual({ amount: 10824, currency: 'USD' })
  })

  it('maps parent transaction ids when present', () => {
    const result = transformTransaction(makeTransaction({ parent_id: 6000, kind: 'refund' }))
    expect(result.parentTransactionId).toBe('6000')
    expect(result.kind).toBe('REFUND')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeTransaction()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeTransaction())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
