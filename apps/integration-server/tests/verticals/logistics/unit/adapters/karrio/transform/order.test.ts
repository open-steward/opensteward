/**
 * Fixture: the documented Order 200 body (https://docs.karrio.io/reference/openapi,
 * schema Order), placeholders replaced by plausible values of the documented types.
 */
import { describe, it, expect } from 'vitest'
import {
  transformOrder,
  type KarrioOrder,
} from '../../../../../../../src/verticals/logistics/adapters/karrio/transform/order'
import { OrderSchema } from '../../../../../../../src/verticals/logistics/schema/order'

function makeRaw(overrides: Partial<KarrioOrder> = {}): KarrioOrder {
  return {
    id: 'ord_9c1d',
    object_type: 'order',
    order_id: 'CUST-ORD-001',
    order_date: '2024-03-01',
    source: 'API',
    status: 'unfulfilled',
    shipping_to: {
      person_name: 'Bob',
      address_line1: '2 Dest Ave',
      city: 'Los Angeles',
      state_code: 'CA',
      postal_code: '90001',
      country_code: 'US',
    },
    shipping_from: {
      person_name: 'Alice',
      address_line1: '1 Origin St',
      city: 'New York',
      state_code: 'NY',
      postal_code: '10001',
      country_code: 'US',
    },
    line_items: [{ id: 'itm_1', quantity: 1, sku: 'SKU-1', title: 'Widget' }],
    shipments: [{ id: 'shp_1', object_type: 'shipment' }, { id: 'shp_2' }],
    test_mode: false,
    created_at: '2024-03-01 09:30:00.000000+00:00',
    ...overrides,
  }
}

const parse = (raw: KarrioOrder) => OrderSchema.parse(transformOrder(raw))

describe('karrio transformOrder', () => {
  it('parses with OrderSchema', () => {
    expect(() => parse(makeRaw())).not.toThrow()
  })

  it('maps id and order_id', () => {
    const o = parse(makeRaw())
    expect(o.id).toBe('ord_9c1d')
    expect(o.orderNumber).toBe('CUST-ORD-001')
  })

  it.each([
    ['unfulfilled', 'AWAITING_SHIPMENT'],
    ['partial', 'PROCESSING'],
    ['fulfilled', 'SHIPPED'],
    ['delivered', 'DELIVERED'],
    ['cancelled', 'CANCELLED'],
  ])('documented status %s maps to %s', (raw, want) => {
    expect(parse(makeRaw({ status: raw })).status).toBe(want)
  })

  it('an undocumented or missing status is unknown, never PENDING', () => {
    expect(parse(makeRaw({ status: 'open' })).status).toBe('unknown')
    expect(parse(makeRaw({ status: 'returned' })).status).toBe('unknown')
    expect(parse(makeRaw({ status: null })).status).toBe('unknown')
  })

  it('maps shipping_to and shipping_from', () => {
    const o = parse(makeRaw())
    expect(o.destinationAddress).toEqual(expect.objectContaining({ name: 'Bob', country: 'US' }))
    expect(o.originAddress).toEqual(expect.objectContaining({ name: 'Alice', country: 'US' }))
  })

  it('shipmentIds are the ids of the documented shipments[]', () => {
    expect(parse(makeRaw()).shipmentIds).toEqual(['shp_1', 'shp_2'])
    expect(parse(makeRaw({ shipments: [] })).shipmentIds).toBeUndefined()
  })

  it('reads no undocumented total, currency or updated_at', () => {
    const o = parse(
      makeRaw({
        total_price: 9999,
        currency: 'USD',
        shipment_ids: ['x'],
        updated_at: '2024-03-02T00:00:00Z',
      }),
    )
    expect(o.totalAmount).toBeUndefined()
    expect(o.currency).toBeUndefined()
    expect(o.updatedAt).toBeUndefined()
    expect(o.shipmentIds).toEqual(['shp_1', 'shp_2'])
  })

  it('createdAt parses the documented datetime', () => {
    expect(parse(makeRaw()).createdAt).toEqual(new Date('2024-03-01T09:30:00.000Z'))
  })
})
