import { describe, it, expect } from 'vitest'
import {
  hasShipped,
  transformFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/coupang/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import { orderSheetExample } from '../fixtures'

describe('transformFulfillment (Coupang order sheet)', () => {
  it('maps the documented example and parses as a canonical Fulfillment', () => {
    const f = FulfillmentSchema.parse(transformFulfillment(orderSheetExample()))
    expect(f).toEqual(
      expect.objectContaining({
        id: '642538970006401429',
        orderId: '642538970006401429',
        status: 'SUCCESS',
        trackingNumber: '340010913442',
        carrier: 'CJ 대한통운',
        shippedAt: '2025-01-15T22:17:13.973Z',
        deliveredAt: '2025-01-15T22:17:13.973Z',
        lineItems: [{ lineItemId: '642538970006401429:001', quantity: 1 }],
      }),
    )
  })

  it('counts DEPARTURE, DELIVERING and FINAL_DELIVERY as shipped, and nothing else', () => {
    const shipped = [
      'ACCEPT',
      'INSTRUCT',
      'DEPARTURE',
      'DELIVERING',
      'FINAL_DELIVERY',
      'NONE_TRACKING',
    ].map((status) => hasShipped({ ...orderSheetExample(), status }))
    expect(shipped).toEqual([false, false, true, true, true, false])
  })

  it('refuses an order sheet that has not shipped', () => {
    expect(() => transformFulfillment({ ...orderSheetExample(), status: 'INSTRUCT' })).toThrow(
      /has not shipped/,
    )
  })

  it('leaves an empty invoice number out instead of publishing ""', () => {
    const f = FulfillmentSchema.parse(
      transformFulfillment({
        ...orderSheetExample(),
        status: 'DEPARTURE',
        invoiceNumber: '',
        deliveredDate: '',
      }),
    )
    expect(f.trackingNumber).toBeUndefined()
    expect(f.deliveredAt).toBeUndefined()
  })

  it('leaves out a date documented as "yyyy-MM-dd HH:mm:ss" when it carries no offset', () => {
    const f = FulfillmentSchema.parse(
      transformFulfillment({
        ...orderSheetExample(),
        inTrasitDateTime: '2025-01-15 14:17:13',
        deliveredDate: '2025-01-16T09:00:00',
      }),
    )
    expect(f.shippedAt).toBeUndefined()
    expect(f.deliveredAt).toBeUndefined()
  })

  it('converts a date that carries its own offset, as in the documented example', () => {
    const f = transformFulfillment({
      ...orderSheetExample(),
      inTrasitDateTime: '2025-01-15T14:17:13+09:00',
      deliveredDate: '2025-01-16T00:00:00Z',
    })
    expect(f.shippedAt).toBe('2025-01-15T05:17:13.000Z')
    expect(f.deliveredAt).toBe('2025-01-16T00:00:00.000Z')
  })
})
