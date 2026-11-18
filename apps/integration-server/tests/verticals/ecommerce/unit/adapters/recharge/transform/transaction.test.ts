import { describe, it, expect } from 'vitest'
import {
  transformTransaction,
  type RawRechargeCharge,
} from '../../../../../../../src/verticals/ecommerce/adapters/recharge/transform/transaction'
import { TransactionSchema } from '../../../../../../../src/verticals/ecommerce/schema/transaction'

function makeCharge(overrides: Partial<RawRechargeCharge> = {}): RawRechargeCharge {
  return {
    id: 7001,
    external_order_id: { ecommerce: 'shopify-order-999' },
    payment_processor: 'stripe',
    external_transaction_id: { stripe: 'ch_abc123' },
    status: 'success',
    total_price: '49.97',
    currency: 'USD',
    processed_at: '2024-05-01T10:00:00Z',
    created_at: '2024-05-01T10:00:00Z',
    ...overrides,
  }
}

describe('transformTransaction', () => {
  it('maps id and orderId from external_order_id', () => {
    const result = transformTransaction(makeCharge())
    expect(result.id).toBe('7001')
    expect(result.orderId).toBe('shopify-order-999')
  })

  it('falls back orderId to own id when no external_order_id', () => {
    const result = transformTransaction(makeCharge({ external_order_id: null }))
    expect(result.orderId).toBe('7001')
  })

  it('maps success status to kind SALE and status SUCCESS', () => {
    const result = transformTransaction(makeCharge())
    expect(result.kind).toBe('SALE')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps refunded status to kind REFUND', () => {
    const result = transformTransaction(makeCharge({ status: 'refunded' }))
    expect(result.kind).toBe('REFUND')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps error status to ERROR', () => {
    const result = transformTransaction(makeCharge({ status: 'error' }))
    expect(result.status).toBe('ERROR')
  })

  it('converts total_price to minor units', () => {
    const result = transformTransaction(makeCharge())
    expect(result.amount).toEqual({ amount: 4997, currency: 'USD' })
  })

  it('maps gateway and authorizationCode', () => {
    const result = transformTransaction(makeCharge())
    expect(result.gateway).toBe('stripe')
    expect(result.authorizationCode).toBe('ch_abc123')
  })

  it('maps error fields', () => {
    const result = transformTransaction(
      makeCharge({
        error: 'Card declined',
        error_type: 'CARD_DECLINED',
        status: 'error',
      }),
    )
    expect(result.errorMessage).toBe('Card declined')
    expect(result.errorCode).toBe('CARD_DECLINED')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeCharge()
    const result = transformTransaction(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies TransactionSchema', () => {
    const result = transformTransaction(makeCharge())
    expect(() => TransactionSchema.parse(result)).not.toThrow()
  })
})
