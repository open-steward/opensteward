import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/bold-commerce/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

describe('transformTransaction (bold-commerce)', () => {
  const raw: RawShopifyTransaction = {
    id: 555,
    order_id: 3001,
    kind: 'sale',
    status: 'success',
    amount: '53.99',
    currency: 'USD',
    gateway: 'stripe',
    authorization: 'AUTH_ABC',
    parent_id: null,
    error_code: null,
    message: null,
    processed_at: '2024-03-01T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
  }

  it('maps id to string', () => {
    expect(transformTransaction(raw).id).toBe('555')
  })

  it('maps orderId to string', () => {
    expect(transformTransaction(raw).orderId).toBe('3001')
  })

  it('maps kind to SALE', () => {
    expect(transformTransaction(raw).kind).toBe('SALE')
  })

  it('maps status to SUCCESS', () => {
    expect(transformTransaction(raw).status).toBe('SUCCESS')
  })

  it('converts amount to minor units', () => {
    // 53.99 USD → 5399 cents
    expect(transformTransaction(raw).amount?.amount).toBe(5399)
    expect(transformTransaction(raw).amount?.currency).toBe('USD')
  })

  it('maps gateway', () => {
    expect(transformTransaction(raw).gateway).toBe('stripe')
  })

  it('maps authorizationCode from authorization', () => {
    expect(transformTransaction(raw).authorizationCode).toBe('AUTH_ABC')
  })

  it('maps REFUND kind', () => {
    expect(transformTransaction({ ...raw, kind: 'refund' }).kind).toBe('REFUND')
  })

  it('maps VOID kind', () => {
    expect(transformTransaction({ ...raw, kind: 'void' }).kind).toBe('VOID')
  })

  it('passes TransactionSchema validation', () => {
    expect(() => TransactionSchema.parse(transformTransaction(raw))).not.toThrow()
  })

  it('handles unknown kind gracefully', () => {
    const result = transformTransaction({ ...raw, kind: 'unknown_kind' })
    expect(result.kind).toBeUndefined()
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})

describe('untransformTransaction (bold-commerce)', () => {
  it('round-trips kind (lowercase) and gateway', () => {
    const canonical = transformTransaction({
      id: 1,
      kind: 'capture',
      status: 'success',
      gateway: 'paypal',
      amount: '10.00',
      currency: 'USD',
    })
    const body = untransformTransaction(canonical)
    expect(body.kind).toBe('capture')
    expect(body.gateway).toBe('paypal')
  })
})
