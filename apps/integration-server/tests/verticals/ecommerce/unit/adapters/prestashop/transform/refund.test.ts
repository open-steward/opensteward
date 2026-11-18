import { describe, it, expect } from 'vitest'
import {
  transformRefund,
  untransformRefund,
  type RawPrestaShopOrderSlip,
} from '../../../../../../../src/verticals/ecommerce/adapters/prestashop/transform/refund'
import { RefundSchema } from '../../../../../../../src/verticals/ecommerce/schema/refund'

function makeOrderSlip(
  overrides: Partial<RawPrestaShopOrderSlip> = {},
): RawPrestaShopOrderSlip {
  return {
    id: 5001,
    id_order: 1001,
    id_customer: 7001,
    total_products_tax_incl: '49.990000',
    total_shipping_tax_incl: '0.000000',
    amount: '49.990000',
    date_add: '2024-05-10T10:00:00.000Z',
    associations: {
      order_slip_details: [
        {
          id_order_detail: 9001,
          product_quantity: 1,
          amount_tax_incl: '49.990000',
          amount_tax_excl: '41.660000',
        },
      ],
    },
    ...overrides,
  }
}

describe('transformRefund (PrestaShop)', () => {
  it('maps core fields with rounded amounts', () => {
    const result = transformRefund(makeOrderSlip(), '1001')
    expect(result.id).toBe('5001')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('1001')
    expect(result.amount).toEqual({ amount: 4999, currency: 'EUR' })
    expect(result.restock).toBe(false)
  })

  it('maps refund line items from order_slip_details', () => {
    const result = transformRefund(makeOrderSlip(), '1001')
    expect(result.refundLineItems).toHaveLength(1)
    const li = result.refundLineItems![0]!
    expect(li.lineItemId).toBe('9001')
    expect(li.quantity).toBe(1)
    expect(li.amount).toEqual({ amount: 4999, currency: 'EUR' })
  })

  it('falls back to id_order from raw when orderId not provided', () => {
    const result = transformRefund(makeOrderSlip())
    expect(result.orderId).toBe('1001')
  })

  it('computes amount from totals when amount field is missing', () => {
    const result = transformRefund(
      makeOrderSlip({
        amount: undefined,
        total_products_tax_incl: '30.000000',
        total_shipping_tax_incl: '5.000000',
      }),
      '1001',
    )
    expect(result.amount).toEqual({ amount: 3500, currency: 'EUR' })
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrderSlip()
    const result = transformRefund(raw, '1001')
    expect(result.metadata).toBe(raw)
    expect(() => RefundSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformRefund', () => {
    const canonical = transformRefund(makeOrderSlip(), '1001')
    const body = untransformRefund(canonical)
    expect(body['amount']).toBe('49.99')
    expect(body['id_order']).toBe('1001')
  })
})
