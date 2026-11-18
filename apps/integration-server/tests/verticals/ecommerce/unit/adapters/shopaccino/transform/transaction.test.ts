import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  untransformTransaction,
  type RawShopifyTransaction,
} from '../../../../../../../src/verticals/ecommerce/adapters/shopaccino/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeRaw(overrides: Partial<RawShopifyTransaction> = {}): RawShopifyTransaction {
  return {
    id: 30001,
    order_id: 10001,
    kind: 'sale',
    status: 'success',
    amount: '65.39',
    currency: 'USD',
    gateway: 'shopaccino_payments',
    authorization: 'AUTH-XYZ',
    processed_at: '2024-03-01T09:05:00.000Z',
    created_at: '2024-03-01T09:05:00.000Z',
    ...overrides,
  }
}

describe('shopaccino transformTransaction', () => {
  it('maps id and orderId to strings', () => {
    const result = transformTransaction(makeRaw())
    expect(result.id).toBe('30001')
    expect(result.orderId).toBe('10001')
  })

  it('maps kind via KIND_MAP (sale → SALE)', () => {
    const result = transformTransaction(makeRaw())
    expect(result.kind).toBe('SALE')
  })

  it('maps status via STATUS_MAP (success → SUCCESS)', () => {
    const result = transformTransaction(makeRaw())
    expect(result.status).toBe('SUCCESS')
  })

  it('converts amount to minor units (USD: ×100)', () => {
    const result = transformTransaction(makeRaw())
    // 65.39 USD = 6539 cents
    expect(result.amount?.amount).toBe(6539)
    expect(result.amount?.currency).toBe('USD')
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeRaw())
    expect(result.gateway).toBe('shopaccino_payments')
    expect(result.authorizationCode).toBe('AUTH-XYZ')
  })

  it('produces output that passes TransactionSchema', () => {
    const result = transformTransaction(makeRaw())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformTransaction', () => {
    const canonical = transformTransaction(makeRaw())
    const back = untransformTransaction(canonical)
    expect(back.kind).toBe('sale')
    expect(back.gateway).toBe('shopaccino_payments')
  })
})
