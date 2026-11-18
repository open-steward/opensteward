import { describe, it, expect } from 'vitest'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'
import {
  transformFulfillment,
  transformFulfillments,
  mapFulfillmentStatus,
} from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/fulfillment'
import type { RawJumiaOrderItem } from '../../../../../../../src/verticals/ecommerce/adapters/jumia/transform/order'

function makeItem(overrides: Partial<RawJumiaOrderItem> = {}): RawJumiaOrderItem {
  return {
    order_item_id: 'OI-100',
    sku: 'PHONE-CASE-001',
    seller_sku: 'PC-001',
    name: 'Phone Case - Red',
    paid_price: 3500,
    quantity: 1,
    status: 'shipped',
    tracking_code: 'JUM-TRK-12345',
    shipment_provider: 'Jumia Express',
    tracking_url: 'https://tracking.jumia.com/JUM-TRK-12345',
    ...overrides,
  }
}

describe('mapFulfillmentStatus (Jumia)', () => {
  it('maps undefined to PENDING', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })

  it('maps pending to PENDING', () => {
    expect(mapFulfillmentStatus('pending')).toBe('PENDING')
  })

  it('maps ready_to_ship to OPEN', () => {
    expect(mapFulfillmentStatus('ready_to_ship')).toBe('OPEN')
  })

  it('maps shipped to SUCCESS', () => {
    expect(mapFulfillmentStatus('shipped')).toBe('SUCCESS')
  })

  it('maps delivered to SUCCESS', () => {
    expect(mapFulfillmentStatus('delivered')).toBe('SUCCESS')
  })

  it('maps cancelled to CANCELLED', () => {
    expect(mapFulfillmentStatus('cancelled')).toBe('CANCELLED')
  })

  it('maps failed to FAILURE', () => {
    expect(mapFulfillmentStatus('failed')).toBe('FAILURE')
  })
})

describe('transformFulfillment (Jumia)', () => {
  it('builds a synthetic id from orderId and order_item_id', () => {
    const result = transformFulfillment('ORD-001', makeItem())
    expect(result.id).toBe('ORD-001:OI-100')
    expect(result.orderId).toBe('ORD-001')
  })

  it('extracts tracking information', () => {
    const result = transformFulfillment('ORD-001', makeItem())
    expect(result.trackingNumber).toBe('JUM-TRK-12345')
    expect(result.carrier).toBe('Jumia Express')
    expect(result.trackingUrl).toBe('https://tracking.jumia.com/JUM-TRK-12345')
  })

  it('maps status to canonical fulfillment status', () => {
    const result = transformFulfillment('ORD-001', makeItem())
    expect(result.status).toBe('SUCCESS')
  })

  it('creates a single line item entry', () => {
    const result = transformFulfillment('ORD-001', makeItem())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({
      lineItemId: 'OI-100',
      quantity: 1,
    })
  })

  it('produces canonical output that satisfies the schema', () => {
    const result = transformFulfillment('ORD-001', makeItem())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('transformFulfillments (Jumia)', () => {
  it('returns empty array for undefined items', () => {
    expect(transformFulfillments('ORD-001', undefined)).toEqual([])
  })

  it('returns empty array for empty items', () => {
    expect(transformFulfillments('ORD-001', [])).toEqual([])
  })

  it('transforms multiple items', () => {
    const items = [makeItem(), makeItem({ order_item_id: 'OI-200', status: 'pending' })]
    const result = transformFulfillments('ORD-001', items)
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('ORD-001:OI-100')
    expect(result[1]!.id).toBe('ORD-001:OI-200')
    expect(result[1]!.status).toBe('PENDING')
  })
})
