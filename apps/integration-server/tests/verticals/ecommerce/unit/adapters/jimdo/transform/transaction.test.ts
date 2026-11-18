import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/jimdo/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

describe('transformTransaction (jimdo)', () => {
  const raw: RawShopifyTransaction = {
    id: 700,
    order_id: 1001,
    kind: 'sale',
    status: 'success',
    amount: '54.36',
    currency: 'USD',
    gateway: 'shopify_payments',
    authorization: 'AUTH123456',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    const result = transformTransaction(raw)
    expect(result.id).toBe('700')
  })

  it('maps orderId to string', () => {
    const result = transformTransaction(raw)
    expect(result.orderId).toBe('1001')
  })

  it('maps kind sale → SALE', () => {
    const result = transformTransaction(raw)
    expect(result.kind).toBe('SALE')
  })

  it('maps status success → SUCCESS', () => {
    const result = transformTransaction(raw)
    expect(result.status).toBe('SUCCESS')
  })

  it('converts amount to minor units (USD × 100)', () => {
    const result = transformTransaction(raw)
    // 54.36 → 5436 cents
    expect(result.amount).toEqual({ amount: 5436, currency: 'USD' })
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(raw)
    expect(result.gateway).toBe('shopify_payments')
    expect(result.authorizationCode).toBe('AUTH123456')
  })

  it('sets parentTransactionId to undefined when parent_id is null', () => {
    const result = transformTransaction(raw)
    expect(result.parentTransactionId).toBeUndefined()
  })

  it('produces schema-valid output', () => {
    const result = transformTransaction(raw)
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('maps kind refund → REFUND and status failure → FAILURE', () => {
    const result = transformTransaction({ ...raw, kind: 'refund', status: 'failure' })
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('FAILURE')
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction', () => {
    const result = transformTransaction(raw)
    const back = untransformTransaction(result)
    expect(back.kind).toBe('sale')
    expect(back.gateway).toBe('shopify_payments')
  })
})
