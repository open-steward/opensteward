/**
 * Tmall `Shipping` (taobao.logistics.orders.get, docId 235) → canonical
 * Fulfillment. The fixture is the documented response example
 * (`rspSampleJson`), trimmed to the fields the adapter requests.
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  mapShippingStatus,
  parseShippingFulfillmentId,
  SHIPPING_FIELDS,
  type RawTmallShipping,
} from '../../../../../../../src/verticals/ecommerce/adapters/tmall/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

// From the documented example of logistics_orders_get_response.shippings.shipping[0].
function docShipping(overrides: Partial<RawTmallShipping> = {}): RawTmallShipping {
  return {
    tid: 125555221,
    order_code: 'LP12345678',
    out_sid: '1455858255',
    created: '2000-01-01 00:00:00',
    modified: '2000-01-01 00:00:00',
    status: 'CREATED',
    company_name: 'sto',
    seller_confirm: 'yes',
    ...overrides,
  }
}

describe('transformFulfillment (Tmall Shipping)', () => {
  it('maps the documented example and satisfies FulfillmentSchema', () => {
    const f = FulfillmentSchema.parse(transformFulfillment(docShipping()))
    expect(f).toMatchObject({
      id: '125555221:LP12345678',
      orderId: '125555221',
      status: 'PENDING',
      trackingNumber: '1455858255',
      carrier: 'sto',
      createdAt: '2000-01-01T00:00:00.000Z',
      updatedAt: '2000-01-01T00:00:00.000Z',
    })
    expect(f.metadata).toEqual(docShipping())
  })

  it('omits trackingNumber and carrier when the logistics order has none', () => {
    const f = FulfillmentSchema.parse(
      transformFulfillment(docShipping({ out_sid: undefined, company_name: undefined })),
    )
    expect(f.trackingNumber).toBeUndefined()
    expect(f.carrier).toBeUndefined()
    expect(f.id).toBe('125555221:LP12345678')
  })

  it('throws without tid or order_code rather than inventing an id', () => {
    expect(() => transformFulfillment(docShipping({ tid: undefined }))).toThrow(/no tid/)
    expect(() => transformFulfillment(docShipping({ order_code: undefined }))).toThrow(
      /no order_code/,
    )
  })

  it('requests only documented Shipping fields', () => {
    const documented = new Set(
      (
        'tid,order_code,seller_nick,buyer_nick,delivery_start,delivery_end,out_sid,item_title,' +
        'receiver_name,created,modified,status,type,freight_payer,seller_confirm,company_name,' +
        'sub_tids,is_spilt'
      ).split(','),
    )
    for (const f of SHIPPING_FIELDS.split(',')) expect(documented.has(f)).toBe(true)
  })
})

describe('mapShippingStatus', () => {
  it.each([
    ['CREATED', 'PENDING'],
    ['RECREATED', 'PENDING'],
    ['SENDING', 'PENDING'],
    ['ACCEPTING', 'PENDING'],
    ['ACCEPTED', 'OPEN'],
    ['PICK_UP', 'SUCCESS'],
    ['ACCEPTED_BY_RECEIVER', 'SUCCESS'],
    ['CANCELLED', 'CANCELLED'],
    ['CLOSED', 'CANCELLED'],
    ['REJECTED', 'FAILURE'],
    ['PICK_UP_FAILED', 'FAILURE'],
    ['LOST', 'FAILURE'],
    ['REJECTED_BY_RECEIVER', 'FAILURE'],
  ])('maps documented %s to %s', (raw, canonical) => {
    expect(mapShippingStatus(raw)).toBe(canonical)
    FulfillmentSchema.parse(transformFulfillment(docShipping({ status: raw })))
  })

  it("maps an undocumented status to 'unknown' and an absent one to undefined", () => {
    expect(mapShippingStatus('SOMETHING_NEW')).toBe('unknown')
    expect(mapShippingStatus(undefined)).toBeUndefined()
    expect(transformFulfillment(docShipping({ status: undefined })).status).toBeUndefined()
  })
})

describe('parseShippingFulfillmentId', () => {
  it('splits tid and order_code at the first colon', () => {
    expect(parseShippingFulfillmentId('125555221:LP12345678')).toEqual({
      tid: '125555221',
      orderCode: 'LP12345678',
    })
    expect(parseShippingFulfillmentId('7:A:B')).toEqual({ tid: '7', orderCode: 'A:B' })
  })

  it('rejects ids without a numeric tid and an order_code', () => {
    expect(parseShippingFulfillmentId('125555221')).toBeUndefined()
    expect(parseShippingFulfillmentId('125555221:')).toBeUndefined()
    expect(parseShippingFulfillmentId(':LP1')).toBeUndefined()
    expect(parseShippingFulfillmentId('abc:LP1')).toBeUndefined()
  })
})
