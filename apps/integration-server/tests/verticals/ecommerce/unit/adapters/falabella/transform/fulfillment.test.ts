/**
 * Doc: https://developers.falabella.com/docs/orders/getorderitems (verbatim
 * JSON response example quoted in the source file header) and
 * .../orders-flow (SetStatusToReadyToShip / SetStatusToCanceled).
 */
import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  transformFulfillments,
} from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/fulfillment'
import type { RawFalabellaOrderItem } from '../../../../../../../src/verticals/ecommerce/adapters/falabella/transform/order'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeItem(overrides: Partial<RawFalabellaOrderItem> = {}): RawFalabellaOrderItem {
  return {
    OrderItemId: '101311982',
    OrderId: '1001687807',
    Name: 'Test Product',
    Sku: '2521154701',
    Currency: 'COP',
    Status: 'pending',
    ShipmentProvider: 'ibis',
    TrackingCode: '800026611544860011',
    ItemPrice: '3521.00',
    PaidPrice: '3521.00',
    ...overrides,
  }
}

describe('transformFulfillment (Falabella)', () => {
  it('keys id on orderId:orderItemId', () => {
    const result = transformFulfillment(makeItem())
    expect(result.id).toBe('1001687807:101311982')
    expect(result.orderId).toBe('1001687807')
    expect(result.trackingNumber).toBe('800026611544860011')
    expect(result.carrier).toBe('ibis')
  })

  it('maps pending → PENDING and ready_to_ship → OPEN', () => {
    expect(transformFulfillment(makeItem({ Status: 'pending' })).status).toBe('PENDING')
    expect(transformFulfillment(makeItem({ Status: 'ready_to_ship' })).status).toBe('OPEN')
  })

  it('falls back to unknown for an unrecognised status', () => {
    expect(transformFulfillment(makeItem({ Status: 'something_new' })).status).toBe('unknown')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    expect(() => FulfillmentSchema.parse(transformFulfillment(makeItem()))).not.toThrow()
  })
})

describe('transformFulfillments (Falabella)', () => {
  it('maps every item', () => {
    const result = transformFulfillments([makeItem(), makeItem({ OrderItemId: '2', Status: 'ready_to_ship' })])
    expect(result).toHaveLength(2)
    expect(result[1]!.status).toBe('OPEN')
  })
})
