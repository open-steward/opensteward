import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  untransformOrder,
  type RawThirtyBeesOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/thirty-bees/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

function makeOrder(overrides: Partial<RawThirtyBeesOrder> = {}): RawThirtyBeesOrder {
  return {
    id: 1001,
    reference: 'ABCDEF',
    id_customer: 7001,
    current_state: 4,
    payment: 'Bank wire',
    total_paid_tax_incl: '108.24',
    total_products_wt: '100.00',
    total_shipping_tax_incl: '4.99',
    total_discounts_tax_incl: '5.00',
    _currency_iso: 'EUR',
    associations: {
      order_rows: [
        {
          id: 9001,
          product_id: 42,
          product_attribute_id: 501,
          product_name: 'Ocean Blue T-Shirt',
          product_quantity: 2,
          unit_price_tax_incl: '49.99',
          product_reference: 'TEE-S-BLUE',
        },
      ],
    },
    date_add: '2024-05-01T10:00:00.000Z',
    date_upd: '2024-05-01T12:00:00.000Z',
    ...overrides,
  }
}

describe('transformOrder (Thirty Bees)', () => {
  it('maps core fields and splits status into canonical pair', () => {
    const result = transformOrder(makeOrder())
    expect(result.id).toBe('1001')
    expect(typeof result.id).toBe('string')
    expect(result.orderNumber).toBe('ABCDEF')
    expect(result.name).toBe('#ABCDEF')
    expect(result.customerId).toBe('7001')
    expect(result.currency).toBe('EUR')
    // State 4 = Shipped → PAID + FULFILLED
    expect(result.financialStatus).toBe('PAID')
    expect(result.fulfillmentStatus).toBe('FULFILLED')
    expect(result.totalPrice).toEqual({ amount: 10824, currency: 'EUR' })
  })

  it('maps line items with unit price', () => {
    const result = transformOrder(makeOrder())
    expect(result.lineItems).toHaveLength(1)
    const li = result.lineItems![0]!
    expect(li.id).toBe('9001')
    expect(li.productId).toBe('42')
    expect(li.variantId).toBe('501')
    expect(li.quantity).toBe(2)
    expect(li.price).toEqual({ amount: 4999, currency: 'EUR' })
    expect(li.sku).toBe('TEE-S-BLUE')
  })

  it('covers common Thirty Bees state → canonical pair mappings', () => {
    const cases: Array<[number, string | undefined, string | undefined]> = [
      [1, 'PENDING', 'UNFULFILLED'],
      [2, 'PAID', 'UNFULFILLED'],
      [3, 'PAID', 'UNFULFILLED'],
      [4, 'PAID', 'FULFILLED'],
      [5, 'PAID', 'FULFILLED'],
      [6, 'VOIDED', 'UNFULFILLED'],
      [7, 'REFUNDED', 'UNFULFILLED'],
      [8, 'VOIDED', 'UNFULFILLED'],
      [9, 'PAID', 'PARTIAL'],
    ]
    for (const [state, fin, ful] of cases) {
      const r = transformOrder(makeOrder({ current_state: state }))
      expect(r.financialStatus).toBe(fin)
      expect(r.fulfillmentStatus).toBe(ful)
    }
  })

  it('sets cancelledAt when state is 6 (Cancelled)', () => {
    const result = transformOrder(makeOrder({ current_state: 6 }))
    expect(result.cancelledAt).toBe('2024-05-01T12:00:00.000Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeOrder()
    const result = transformOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => OrderSchema.parse(result)).not.toThrow()
  })

  it('round-trips writable fields via untransformOrder', () => {
    const canonical = transformOrder(makeOrder())
    const body = untransformOrder(canonical)
    expect(body['id_customer']).toBe('7001')
  })

  it('maps subtotalPrice, totalShipping, totalDiscounts correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.subtotalPrice).toEqual({ amount: 10000, currency: 'EUR' })
    expect(result.totalShipping).toEqual({ amount: 499, currency: 'EUR' })
    expect(result.totalDiscounts).toEqual({ amount: 500, currency: 'EUR' })
  })

  it('defaults currency to EUR when _currency_iso not set', () => {
    const result = transformOrder(makeOrder({ _currency_iso: undefined }))
    expect(result.currency).toBe('EUR')
  })

  it('returns undefined for line item variantId when product_attribute_id is 0', () => {
    const result = transformOrder(
      makeOrder({
        associations: {
          order_rows: [
            {
              id: 9001,
              product_id: 42,
              product_attribute_id: 0,
              product_name: 'Simple Product',
              product_quantity: 1,
              unit_price_tax_incl: '20.00',
            },
          ],
        },
      }),
    )
    expect(result.lineItems![0]!.variantId).toBeUndefined()
  })

  it('maps timestamps correctly', () => {
    const result = transformOrder(makeOrder())
    expect(result.createdAt).toBe('2024-05-01T10:00:00.000Z')
    expect(result.updatedAt).toBe('2024-05-01T12:00:00.000Z')
  })

  it('cancelledAt is undefined for non-cancelled orders', () => {
    const result = transformOrder(makeOrder({ current_state: 4 }))
    expect(result.cancelledAt).toBeUndefined()
  })

  it('maps unknown state without financial/fulfillment status', () => {
    const result = transformOrder(makeOrder({ current_state: 99 }))
    expect(result.financialStatus).toBeUndefined()
    expect(result.fulfillmentStatus).toBeUndefined()
  })
})
