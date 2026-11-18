import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
  mapFulfillmentStatus,
} from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/fulfillment'
import type { RawLazadaOrderItem } from '../../../../../../../src/verticals/ecommerce/adapters/lazada/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeOrderItem(
  overrides: Partial<RawLazadaOrderItem> = {},
): RawLazadaOrderItem {
  return {
    order_item_id: 111,
    shop_sku: 'EARBUDS-BLK-SG',
    sku: 'EARBUDS-BLK',
    name: 'Wireless Bluetooth Earbuds (Black)',
    paid_price: '29.99',
    quantity: 2,
    status: 'shipped',
    tracking_code: 'SG1234567890',
    shipment_provider: 'J&T Express',
    ...overrides,
  }
}

describe('transformFulfillment (Lazada)', () => {
  it('uses orderId:orderItemId as the canonical id', () => {
    const result = transformFulfillment('ORD-1001', makeOrderItem())
    expect(result.id).toBe('ORD-1001:111')
    expect(result.orderId).toBe('ORD-1001')
  })

  it('maps tracking and carrier info', () => {
    const result = transformFulfillment('ORD-1001', makeOrderItem())
    expect(result.trackingNumber).toBe('SG1234567890')
    expect(result.carrier).toBe('J&T Express')
  })

  it('maps shipped status to SUCCESS', () => {
    const result = transformFulfillment('ORD-1001', makeOrderItem())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformFulfillment(
      'ORD-1001',
      makeOrderItem({ status: 'pending' }),
    )
    expect(result.status).toBe('PENDING')
  })

  it('maps packed status to OPEN', () => {
    const result = transformFulfillment(
      'ORD-1001',
      makeOrderItem({ status: 'packed' }),
    )
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformFulfillment(
      'ORD-1001',
      makeOrderItem({ status: 'cancelled' }),
    )
    expect(result.status).toBe('CANCELLED')
  })

  it('maps failed status to FAILURE', () => {
    const result = transformFulfillment(
      'ORD-1001',
      makeOrderItem({ status: 'failed' }),
    )
    expect(result.status).toBe('FAILURE')
  })

  it('includes line items with quantity', () => {
    const result = transformFulfillment('ORD-1001', makeOrderItem())
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toMatchObject({
      lineItemId: '111',
      quantity: 2,
    })
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment('ORD-1001', makeOrderItem())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('preserves raw item in metadata', () => {
    const item = makeOrderItem()
    const result = transformFulfillment('ORD-1001', item)
    expect(result.metadata['raw']).toBe(item)
    expect(result.metadata['sellerSku']).toBe('EARBUDS-BLK')
  })
})

describe('transformFulfillments (Lazada)', () => {
  it('returns empty array for undefined or empty items', () => {
    expect(transformFulfillments('ORD-1', undefined)).toEqual([])
    expect(transformFulfillments('ORD-1', [])).toEqual([])
  })

  it('transforms multiple items', () => {
    const items = [makeOrderItem(), makeOrderItem({ order_item_id: 112, sku: 'EARBUDS-WHT' })]
    const result = transformFulfillments('ORD-1001', items)
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('ORD-1001:111')
    expect(result[1]!.id).toBe('ORD-1001:112')
  })
})

describe('mapFulfillmentStatus (Lazada)', () => {
  it('returns PENDING for undefined status', () => {
    expect(mapFulfillmentStatus(undefined)).toBe('PENDING')
  })

  it('maps ready_to_ship to OPEN', () => {
    expect(mapFulfillmentStatus('ready_to_ship')).toBe('OPEN')
  })

  it('maps delivered to SUCCESS', () => {
    expect(mapFulfillmentStatus('delivered')).toBe('SUCCESS')
  })

  it('maps returned to CANCELLED', () => {
    expect(mapFulfillmentStatus('returned')).toBe('CANCELLED')
  })
})
