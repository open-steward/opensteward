import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  type RawTiendanubeRefund,
} from '../../../../../../../src/verticals/ecommerce/adapters/tiendanube/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeRefund(overrides: Partial<RawTiendanubeRefund> = {}): RawTiendanubeRefund {
  return {
    id: 900,
    order_id: 1042,
    amount: '29.99',
    currency: 'USD',
    reason: 'Customer changed mind',
    note: 'Partial refund',
    restock: true,
    products: [{ id: 101, quantity: 1 }],
    transaction_id: 'txn-001',
    created_at: '2026-02-01T14:20:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (Tiendanube)', () => {
  it('maps id and orderId', () => {
    const result = transformRefund(makeRefund())
    expect(result.id).toBe('900')
    expect(result.orderId).toBe('1042')
  })

  it('converts amount from major-unit string to minor units', () => {
    const result = transformRefund(makeRefund())
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('maps reason, note, and restock', () => {
    const result = transformRefund(makeRefund())
    expect(result.reason).toBe('Customer changed mind')
    expect(result.note).toBe('Partial refund')
    expect(result.restock).toBe(true)
  })

  it('maps products array to refundLineItems', () => {
    const result = transformRefund(makeRefund())
    expect(result.refundLineItems).toHaveLength(1)
    expect(result.refundLineItems![0]!.lineItemId).toBe('101')
    expect(result.refundLineItems![0]!.quantity).toBe(1)
  })

  it('wraps singular transaction_id into transactionIds array', () => {
    const result = transformRefund(makeRefund())
    expect(result.transactionIds).toEqual(['txn-001'])
  })

  it('omits transactionIds when transaction_id is null', () => {
    const result = transformRefund(makeRefund({ transaction_id: null }))
    expect(result.transactionIds).toBeUndefined()
  })

  it('omits amount when raw amount is 0 or missing', () => {
    const result = transformRefund(makeRefund({ amount: '0.00' }))
    expect(result.amount).toBeUndefined()
  })

  it('maps createdAt timestamp', () => {
    const result = transformRefund(makeRefund())
    expect(result.createdAt).toBe('2026-02-01T14:20:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeRefund()
    const result = transformRefund(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying RefundSchema', () => {
    const result = transformRefund(makeRefund())
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })
})
