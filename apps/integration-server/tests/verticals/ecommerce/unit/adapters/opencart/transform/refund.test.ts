import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawOpenCartReturn,
} from '../../../../../../../src/verticals/ecommerce/adapters/opencart/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeReturn(overrides: Partial<RawOpenCartReturn> = {}): RawOpenCartReturn {
  return {
    return_id: 5001,
    order_id: 1001,
    customer_id: 101,
    comment: 'Defective product',
    return_status_id: 2,
    return_status: 'Awaiting Products',
    total: '29.99',
    products: [
      { return_product_id: 801, product_id: 42, name: 'Wireless Mouse', model: 'WM-100', quantity: '1', price: '29.99' },
    ],
    date_added: '2024-05-10T10:00:00.000Z',
    date_modified: '2024-05-11T08:00:00.000Z',
    ...overrides,
  }
}

describe('transformRefund (OpenCart)', () => {
  it('maps core fields with absolute amounts', () => {
    const result = transformRefund(makeReturn(), '1001')
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.reason).toBe('Defective product')
    expect(result.amount).toEqual({ amount: 2999, currency: 'USD' })
    expect(result.restock).toBe(false)
  })

  it('maps refund line items', () => {
    const result = transformRefund(makeReturn(), '1001')
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('801')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 2999, currency: 'USD' })
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeReturn()
    const result = transformRefund(raw, '1001')
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeReturn(), '1001')
    const body = untransformRefund(canonical)
    expect(body['order_id']).toBe('1001')
    expect(body['comment']).toBe('Defective product')
    const products = body['products'] as Array<{ product_id: string; quantity: number }>
    expect(products[0]!.product_id).toBe('801')
    expect(products[0]!.quantity).toBe(1)
  })
})
