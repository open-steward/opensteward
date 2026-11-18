import { describe, it, expect } from 'vitest'
import { transformOrder } from '../../../../../../../src/verticals/ecommerce/adapters/faire/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'
import { docOrder } from '../fixtures'

describe('transformOrder (Faire ExternalOrderV2)', () => {
  it('maps the documented sample order and parses as a canonical Order', () => {
    const o = OrderSchema.parse(transformOrder(docOrder()))
    expect(o.id).toBe('bo_bxdmjbwxid')
    expect(o.customerId).toBe('r_c9385ldj')
    expect(o.fulfillmentStatus).toBe('UNFULFILLED')
    expect(o.financialStatus).toBeUndefined()
    expect(o.createdAt).toBe('2019-03-15T00:09:15.000Z')
    expect(o.updatedAt).toBe('2019-03-15T00:10:00.000Z')
    expect(o.lineItems).toHaveLength(1)
    expect(o.lineItems?.[0]).toMatchObject({
      id: 'oi_bq425ju5vh',
      productId: 'p_fccaefnahr',
      // productId:variantId, the id ProductVariant.id carries
      variantId: 'p_fccaefnahr:po_3745tjzrpc',
      title: 'Golden Dog',
      quantity: 1,
      sku: 'goldenretriever',
      // price_cents: "in USD cents"
      price: { amount: 10000, currency: 'USD' },
    })
    // The sample carries no money with a currency beyond the item, so no totals.
    expect(o.currency).toBeUndefined()
    expect(o.totalPrice).toBeUndefined()
    expect(o.subtotalPrice).toBeUndefined()
  })

  it('maps the address, converting the alpha-3 country_code and using state_code', () => {
    const o = OrderSchema.parse(transformOrder(docOrder()))
    expect(o.shippingAddress).toEqual({
      line1: '41 King Street West',
      line2: '3rd Floor',
      city: 'Kitchener',
      region: 'ON',
      postalCode: 'N2G 1A1',
      country: 'CA',
    })
  })

  it('reads the item price from `price` (ExternalMoneyV2) before the deprecated cents', () => {
    const base = docOrder()
    const o = transformOrder({
      ...base,
      items: [{ ...base.items![0]!, price: { amount_minor: 4999, currency: 'EUR' } }],
    })
    expect(o.lineItems?.[0]?.price).toEqual({ amount: 4999, currency: 'EUR' })
  })

  it('throws on an item with no documented price, name or quantity', () => {
    const base = docOrder()
    const item = base.items![0]!
    expect(() => transformOrder({ ...base, items: [{ ...item, price_cents: undefined }] })).toThrow(
      /no price/,
    )
    expect(() =>
      transformOrder({ ...base, items: [{ ...item, product_name: undefined }] }),
    ).toThrow(/product_name/)
    expect(() => transformOrder({ ...base, items: [{ ...item, quantity: undefined }] })).toThrow(
      /quantity/,
    )
  })

  it('maps payout_costs money and the documented display_id, notes, shipments, cancelled_at', () => {
    const o = OrderSchema.parse(
      transformOrder(
        docOrder({
          display_id: 'BXDMJBWXID',
          notes: 'Please include a handwritten thank-you note',
          state: 'CANCELED',
          cancelled_at: '2019-03-16T00:10:34.000Z',
          shipments: [
            {
              id: 's_bq425ju5vh',
              order_id: 'bo_bxdmjbwxid',
              carrier: 'fedex',
              tracking_code: '94029300101029282',
            },
          ],
          payout_costs: {
            subtotal_after_brand_discounts: { amount_minor: 9000, currency: 'USD' },
            total_brand_discounts: { amount_minor: 1000, currency: 'USD' },
            net_tax: { amount_minor: 500, currency: 'USD' },
          },
        }),
      ),
    )
    expect(o.orderNumber).toBe('BXDMJBWXID')
    expect(o.note).toBe('Please include a handwritten thank-you note')
    expect(o.fulfillmentIds).toEqual(['s_bq425ju5vh'])
    expect(o.cancelledAt).toBe('2019-03-16T00:10:34.000Z')
    expect(o.fulfillmentStatus).toBeUndefined()
    expect(o.currency).toBe('USD')
    expect(o.subtotalPrice).toEqual({ amount: 9000, currency: 'USD' })
    expect(o.totalDiscounts).toEqual({ amount: 1000, currency: 'USD' })
    expect(o.totalTax).toEqual({ amount: 500, currency: 'USD' })
  })

  it.each([
    ['PROCESSING', 'UNFULFILLED'],
    ['BACKORDERED', 'UNFULFILLED'],
    ['PENDING_RETAILER_CONFIRMATION', 'UNFULFILLED'],
    ['PRE_TRANSIT', 'FULFILLED'],
    ['IN_TRANSIT', 'FULFILLED'],
    ['DELIVERED', 'FULFILLED'],
    ['SOMETHING_NEW', 'unknown'],
  ])('maps state %s to fulfillment %s', (state, expected) => {
    expect(OrderSchema.parse(transformOrder(docOrder({ state }))).fulfillmentStatus).toBe(expected)
  })
})

describe('transformOrder line-item variant ids', () => {
  it('names the variant only when the item carries both product_id and variant_id', () => {
    const base = docOrder()
    const item = base.items![0]!
    const o = OrderSchema.parse(
      transformOrder({ ...base, items: [{ ...item, product_id: undefined }] }),
    )
    expect(o.lineItems?.[0]?.variantId).toBeUndefined()
    expect(o.lineItems?.[0]?.productId).toBeUndefined()
  })
})
