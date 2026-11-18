import { describe, it, expect } from 'vitest'
import {
  transformCommerceOrder,
  type RawGoDaddyOrder,
} from '../../../../../../../src/verticals/ecommerce/adapters/godaddy-websites-commerce/transform/commerce-order'
import { OrderSchema } from '../../../../../../../src/verticals/ecommerce/schema/order'

/**
 * Built from the guide's `orders` response
 * (https://developer.godaddy.com/docs/api-users/commerce/manage-orders-and-customers):
 * `{ "id", "number", "statuses": { "status" }, "totals": { "total": { "value": 550, "currencyCode": "USD" } } }`,
 * plus `Order` / `LineItem` fields from the `orderById` reference.
 */
function makeOrder(overrides: Partial<RawGoDaddyOrder> = {}): RawGoDaddyOrder {
  return {
    id: 'Order_2N8xAbC',
    number: '1001',
    numberDisplay: '#1001',
    customerId: 'CUSTOMER_ID',
    createdAt: '2026-08-27T10:00:00.000Z',
    updatedAt: '2026-08-28T11:30:00.000Z',
    processedAt: '2026-08-27T10:00:05.000Z',
    canceledAt: null,
    tags: ['web'],
    transactionIds: ['TXN_1'],
    statuses: { status: 'OPEN' },
    totals: { total: { value: 550, currencyCode: 'USD' } },
    lineItems: [
      {
        id: 'LineItem_2N8xDeF',
        name: 'Coffee mug',
        quantity: 2,
        skuId: 'SKU_ID',
        unitAmount: { value: 275, currencyCode: 'USD' },
      },
    ],
    ...overrides,
  }
}

describe('transformCommerceOrder (GoDaddy Order → Order)', () => {
  it('parses against the canonical OrderSchema', () => {
    expect(() => OrderSchema.parse(transformCommerceOrder(makeOrder()))).not.toThrow()
  })

  it('maps the documented fields; totals.total is minor units, unscaled', () => {
    const o = transformCommerceOrder(makeOrder())
    expect(o.id).toBe('Order_2N8xAbC')
    expect(o.orderNumber).toBe('1001')
    expect(o.name).toBe('#1001')
    expect(o.customerId).toBe('CUSTOMER_ID')
    expect(o.currency).toBe('USD')
    expect(o.totalPrice).toEqual({ amount: 550, currency: 'USD' })
    expect(o.transactionIds).toEqual(['TXN_1'])
    expect(o.tags).toEqual(['web'])
    expect(o.processedAt).toBe('2026-08-27T10:00:05.000Z')
    expect(o.cancelledAt).toBeUndefined()
    expect(o.financialStatus).toBeUndefined()
    expect(o.fulfillmentStatus).toBeUndefined()
  })

  it('maps line items with the unit price and SKU id', () => {
    const [li] = transformCommerceOrder(makeOrder()).lineItems!
    expect(li).toMatchObject({
      id: 'LineItem_2N8xDeF',
      title: 'Coffee mug',
      quantity: 2,
      variantId: 'SKU_ID',
      price: { amount: 275, currency: 'USD' },
    })
  })

  it('omits canonical lineItems when any line lacks a required field or has a fractional quantity', () => {
    const noPrice = makeOrder({
      lineItems: [{ id: 'L1', name: 'x', quantity: 1, unitAmount: null }],
    })
    expect(transformCommerceOrder(noPrice).lineItems).toBeUndefined()
    const fractional = makeOrder({
      lineItems: [
        {
          id: 'L1',
          name: 'Coffee',
          quantity: 2.3,
          unitAmount: { value: 100, currencyCode: 'USD' },
        },
      ],
    })
    const o = transformCommerceOrder(fractional)
    expect(o.lineItems).toBeUndefined()
    expect(() => OrderSchema.parse(o)).not.toThrow()
  })

  it('omits totals when the order has none (no invented amount)', () => {
    const o = transformCommerceOrder(makeOrder({ totals: null }))
    expect(o.totalPrice).toBeUndefined()
    expect(o.currency).toBeUndefined()
  })

  it('maps canceledAt to cancelledAt', () => {
    expect(
      transformCommerceOrder(makeOrder({ canceledAt: '2026-08-29T00:00:00Z' })).cancelledAt,
    ).toBe('2026-08-29T00:00:00.000Z')
  })
})
