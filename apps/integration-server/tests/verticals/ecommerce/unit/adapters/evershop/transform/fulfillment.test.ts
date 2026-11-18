import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawEverShopShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/evershop/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawEverShopShipment> = {}): RawEverShopShipment {
  return {
    shipment_id: 33,
    uuid: 'ship-uuid-evershop-1',
    shipment_order_id: 200,
    order_uuid: 'order-uuid-evershop-1',
    carrier_name: 'DHL',
    tracking_number: 'DHL12345678',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (EverShop)', () => {
  it('uses uuid as id when available', () => {
    const result = transformFulfillment(makeShipment({ uuid: 'ship-uuid-evershop-1' }))
    expect(result.id).toBe('ship-uuid-evershop-1')
  })

  it('falls back to string shipment_id when uuid is absent', () => {
    const result = transformFulfillment(makeShipment({ uuid: undefined }))
    expect(result.id).toBe('33')
  })

  it('uses order_uuid as orderId when available', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.orderId).toBe('order-uuid-evershop-1')
  })

  it('falls back to string shipment_order_id when order_uuid is absent', () => {
    const result = transformFulfillment(makeShipment({ order_uuid: null }))
    expect(result.orderId).toBe('200')
  })

  it('always maps status to SUCCESS (existence implies shipped)', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps carrier_name to carrier', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('DHL')
  })

  it('maps tracking_number', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('DHL12345678')
  })

  it('maps timestamps', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.createdAt).toBeDefined()
    expect(result.updatedAt).toBeDefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (EverShop)', () => {
  it('maps carrier to carrier field', () => {
    const body = untransformFulfillment({ carrier: 'FedEx' })
    expect(body['carrier']).toBe('FedEx')
  })

  it('maps trackingNumber to tracking_number', () => {
    const body = untransformFulfillment({ trackingNumber: 'FDX99999' })
    expect(body['tracking_number']).toBe('FDX99999')
  })
})
