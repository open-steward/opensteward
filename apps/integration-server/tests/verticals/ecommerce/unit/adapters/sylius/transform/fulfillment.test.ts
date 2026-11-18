import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawSyliusShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/sylius/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawSyliusShipment> = {}): RawSyliusShipment {
  return {
    id: 301,
    order: { id: 500, number: '000000042' },
    state: 'shipped',
    tracking: '1Z999AA10123456784',
    method: { code: 'ups_ground', name: 'UPS Ground' },
    units: [
      { id: 1, shippable: { code: 'MUG_BLUE_S', name: 'Small Blue Mug' } },
      { id: 2, shippable: { code: 'MUG_BLUE_S', name: 'Small Blue Mug' } },
      { id: 3, shippable: { code: 'MUG_RED_L', name: 'Large Red Mug' } },
    ],
    shippedAt: '2024-02-21T10:00:00Z',
    createdAt: '2024-02-20T14:30:00Z',
    updatedAt: '2024-02-21T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Sylius)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('301')
    expect(result.orderId).toBe('500')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrier).toBe('UPS Ground')
    expect(result.shippedAt).toBe('2024-02-21T10:00:00Z')
  })

  it('maps status from state', () => {
    expect(transformFulfillment(makeShipment({ state: 'cart' })).status).toBe('PENDING')
    expect(transformFulfillment(makeShipment({ state: 'ready' })).status).toBe('PENDING')
    expect(transformFulfillment(makeShipment({ state: 'shipped' })).status).toBe('SUCCESS')
    expect(transformFulfillment(makeShipment({ state: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('groups units into line items by shippable code', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'MUG_BLUE_S', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: 'MUG_RED_L', quantity: 1 })
  })

  it('handles missing units', () => {
    const result = transformFulfillment(makeShipment({ units: undefined }))
    expect(result.lineItems).toBeUndefined()
  })

  it('handles missing tracking', () => {
    const result = transformFulfillment(makeShipment({ tracking: null }))
    expect(result.trackingNumber).toBeUndefined()
  })

  it('extracts orderId from IRI string', () => {
    const result = transformFulfillment(makeShipment({ order: '/api/v2/admin/orders/42' }))
    expect(result.orderId).toBe('42')
  })

  it('extracts carrier name from method object', () => {
    const result = transformFulfillment(makeShipment({ method: { code: 'dhl', name: 'DHL Express' } }))
    expect(result.carrier).toBe('DHL Express')
  })

  it('handles string method', () => {
    const result = transformFulfillment(makeShipment({ method: '/api/v2/admin/shipping-methods/ups' }))
    expect(result.carrier).toBe('/api/v2/admin/shipping-methods/ups')
  })

  it('preserves metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makeShipment())
    const body = untransformFulfillment(canonical)
    expect(body['tracking']).toBe('1Z999AA10123456784')
  })
})
