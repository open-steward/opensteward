/**
 * Starshipit order transforms, against the documented examples of GET
 * /api/orders ("Get Order(s)", https://api-docs.starshipit.com/, collection
 * https://api-docs.starshipit.com/api/collections/7606649/TVRg69NS):
 *
 *   - "Get Order by order id" → `{ order: <Full Order Model>, success }`;
 *   - "Get Printed Orders w/ Shipping Price" → `{ page_number, page_size,
 *     total_pages, total_records, data: { orders: [...] } }`.
 */
import { describe, it, expect } from 'vitest'
import {
  parseUtcDate,
  transformOrder,
  transformOrderRow,
  type StarshipitOrder,
  type StarshipitOrderRow,
} from '../../../../../../../src/verticals/logistics/adapters/starshipit/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

/** The documented "Get Order by order id" response's `order`, verbatim. */
const DOC_FULL_ORDER: StarshipitOrder = {
  order_id: 1020304051,
  order_date: '2020-04-29T22:46:59.7155669Z',
  order_number: '10001',
  reference: 'Online Order',
  carrier: 'AusPost',
  carrier_name: 'Australia Post',
  carrier_service_code: '7B05',
  shipping_method: 'Express Shipping',
  signature_required: false,
  dangerous_goods: false,
  destination: {
    name: 'John Smith',
    phone: '0290988227',
    street: '20 George Street',
    suburb: 'Sydney',
    state: 'NSW',
    post_code: '2000',
    country: 'Australia',
    delivery_instructions: 'Leave at door',
  },
  items: [
    {
      item_id: 1065580746,
      description: 'Mobile Phone',
      sku: 'MOBILE',
      quantity: 1,
      quantity_to_ship: 0,
      weight: 0.65,
      value: 125,
    },
    {
      item_id: 1065580747,
      description: 'Mobile Case (Black)',
      sku: 'MOBILE-CASE-BLK',
      quantity: 1,
      quantity_to_ship: 0,
      weight: 0.05,
      value: 20,
    },
  ],
  packages: [{ package_id: 1035548017, weight: 0.7, height: 0.04, width: 0.08, length: 0.12 }],
  declared_value: 0,
}

/** The documented "Get Printed Orders w/ Shipping Price" row, verbatim. */
const DOC_ORDER_ROW: StarshipitOrderRow = {
  order_id: 123456789,
  platform: 'TestOrders',
  integration_id: 1,
  order_status: 'Printed',
  order_number: '1',
  reference: '',
  order_date: '2025-07-08T23:29:42.3545569',
  printed_date: '2025-07-09T02:48:27.732779',
  shipped_date: '2025-07-09T02:48:27.732779',
  contact_name: 'John Smith',
  company_name: 'John Smith Ltd',
  state: 'WA',
  country: 'Australia',
  shipping_method: 'Standard',
  shipping_description: 'Standard',
  shipment_type: 'Outgoing',
  carrier_id: 10,
  carrier_name: 'Australia Post',
  carrier_service_code: '7H05',
  carrier_service_name: 'METRO CUBING',
  tracking_numbers: ['2XD000000001000000000'],
  tracking_urls: ['https://auspost.com.au/mypost/track/details/2XD000000001000000000'],
  tracking_full_status: '',
  manifest_number: 0,
  manifest_sent: false,
  writeback_status: 'Not required',
  writeback_details: 'Not Required',
  signature_required: false,
  dangerous_goods: false,
  export_type: '',
  plt: false,
  create_return: false,
  currency: 'NZD',
  declared_value: 51,
  dtp: false,
  add_insurance: false,
  insurance_value: 0,
  price_breakdown: {
    'Calculated Price ex GST': '$26.41',
    'Calculated GST': '$2.64',
    'Calculated Price': '$29.05',
    'Predicted Delivery Dates ': '2-3 days',
  },
  total_shipping_price: 29.05,
  shipping_freight_value: 2.45,
  custom_margin_value: 0,
  total_items: 4,
  total_items_to_ship: 0,
  total_shipped_items: 0,
  total_qty_items: 0,
  total_packages: 0,
  weight: '0',
  weight_unit: 'kg',
  address_validation: 'Valid',
  archived: false,
  tags: ['PICKED', 'PACKED'],
}

describe('starshipit transformOrder (Full Order Model)', () => {
  it('maps the documented get-by-id example and parses as OrderSchema', () => {
    const o = OrderSchema.parse(transformOrder(DOC_FULL_ORDER))
    expect(o.id).toBe('1020304051')
    expect(o.orderNumber).toBe('10001')
    expect(o.requestedServiceCode).toBe('7B05')
    expect(o.orderAt?.toISOString()).toBe('2020-04-29T22:46:59.715Z')
    expect(o.createdAt?.toISOString()).toBe('2020-04-29T22:46:59.715Z')
    expect(o.metadata?.['reference']).toBe('Online Order')
  })

  it('omits country: the Destination Details Model gives a country NAME', () => {
    const o = OrderSchema.parse(transformOrder(DOC_FULL_ORDER))
    expect(o.destinationAddress).toEqual({
      name: 'John Smith',
      phone: '0290988227',
      street1: '20 George Street',
      city: 'Sydney',
      state: 'NSW',
      postalCode: '2000',
    })
    expect(o.destinationAddress?.country).toBeUndefined()
  })

  it('maps items with kg weight, and no unit price when the order has no currency', () => {
    const o = OrderSchema.parse(transformOrder(DOC_FULL_ORDER))
    expect(o.currency).toBeUndefined()
    expect(o.lineItems).toEqual([
      {
        id: '1065580746',
        sku: 'MOBILE',
        name: 'Mobile Phone',
        quantity: 1,
        weight: { value: 0.65, unit: 'kg' },
      },
      {
        id: '1065580747',
        sku: 'MOBILE-CASE-BLK',
        name: 'Mobile Case (Black)',
        quantity: 1,
        weight: { value: 0.05, unit: 'kg' },
      },
    ])
  })

  it('converts a unit price to minor units only beside the documented currency', () => {
    const o = OrderSchema.parse(transformOrder({ ...DOC_FULL_ORDER, currency: 'AUD' }))
    expect(o.currency).toBe('AUD')
    expect(o.lineItems?.map((li) => li.unitAmount)).toEqual([12500, 2000])
  })

  it('maps sender_details to originAddress', () => {
    const o = OrderSchema.parse(
      transformOrder({
        ...DOC_FULL_ORDER,
        sender_details: { name: 'Warehouse', street: '1 Collins St', suburb: 'Melbourne' },
      }),
    )
    expect(o.originAddress).toEqual({
      name: 'Warehouse',
      street1: '1 Collins St',
      city: 'Melbourne',
    })
  })

  it.each([
    ['Unshipped', 'AWAITING_SHIPMENT'],
    ['Printed', 'AWAITING_SHIPMENT'],
    ['Shipped', 'SHIPPED'],
    ['Delivered', 'DELIVERED'],
    ['Saved', 'unknown'],
    [undefined, 'unknown'],
  ] as const)('maps status %s to %s', (status, expected) => {
    const o = OrderSchema.parse(transformOrder({ ...DOC_FULL_ORDER, status }))
    expect(o.status).toBe(expected)
  })

  it('throws when order_id is missing instead of inventing one', () => {
    expect(() => transformOrder({ ...DOC_FULL_ORDER, order_id: undefined })).toThrow(/order_id/)
  })
})

describe('starshipit transformOrderRow (multi-order data.orders row)', () => {
  it('maps the documented list example and parses as OrderSchema', () => {
    const o = OrderSchema.parse(transformOrderRow(DOC_ORDER_ROW))
    expect(o.id).toBe('123456789')
    expect(o.status).toBe('AWAITING_SHIPMENT')
    expect(o.orderNumber).toBe('1')
    expect(o.currency).toBe('NZD')
    expect(o.requestedServiceCode).toBe('7H05')
    expect(o.metadata?.['tracking_numbers']).toEqual(['2XD000000001000000000'])
  })

  it('reads a zoneless order_date as the UTC the docs say it is, in a non-UTC process', () => {
    // A UTC process reads a zoneless string the same either way; force a zone.
    const tz = process.env.TZ
    process.env.TZ = 'Australia/Sydney'
    try {
      const o = OrderSchema.parse(transformOrderRow(DOC_ORDER_ROW))
      expect(o.orderAt?.toISOString()).toBe('2025-07-08T23:29:42.354Z')
      expect(parseUtcDate('2020-01-01T00:00:00')?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
    } finally {
      if (tz === undefined) delete process.env.TZ
      else process.env.TZ = tz
    }
  })

  it('does not guess an address or amounts out of undescribed summary fields', () => {
    const o = OrderSchema.parse(transformOrderRow(DOC_ORDER_ROW))
    expect(o.destinationAddress).toBeUndefined()
    expect(o.totalAmount).toBeUndefined()
    expect(o.shippingAmount).toBeUndefined()
  })

  it('throws when a row has no order_id instead of inventing one', () => {
    expect(() => transformOrderRow({ ...DOC_ORDER_ROW, order_id: undefined })).toThrow(/order_id/)
  })

  it('reads order_status, not the Full Order Model status', () => {
    expect(transformOrderRow({ ...DOC_ORDER_ROW, order_status: 'Shipped' }).status).toBe('SHIPPED')
  })
})

describe('starshipit parseUtcDate', () => {
  it('keeps an explicit zone and appends Z to a zoneless value', () => {
    expect(parseUtcDate('2020-01-01T00:00:00+10:00')?.toISOString()).toBe(
      '2019-12-31T14:00:00.000Z',
    )
    expect(parseUtcDate('2020-01-01T00:00:00')?.toISOString()).toBe('2020-01-01T00:00:00.000Z')
    expect(parseUtcDate(null)).toBeUndefined()
    expect(parseUtcDate('garbage')).toBeUndefined()
  })
})
