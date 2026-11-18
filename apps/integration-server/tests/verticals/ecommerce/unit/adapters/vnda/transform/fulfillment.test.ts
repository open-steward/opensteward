import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawVndaShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/vnda/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawVndaShipment> = {}): RawVndaShipment {
  return {
    id: 300,
    order_id: 1042,
    status: 'in_transit',
    tracking_code: 'TRACK123',
    tracking_url: 'https://correios.com.br/track?n=TRACK123',
    carrier: 'Correios',
    service: 'PAC',
    shipped_at: '2026-01-15T09:30:00.000Z',
    estimated_delivery_at: '2026-01-20T09:30:00.000Z',
    delivered_at: undefined,
    created_at: '2026-01-15T09:00:00.000Z',
    updated_at: '2026-01-15T09:30:00.000Z',
    ...overrides,
  }
}

describe('transformFulfillment (VNDA)', () => {
  it('synthesizes id as orderId:shipmentId', () => {
    const result = transformFulfillment(makeShipment(), '1042')
    expect(result.id).toBe('1042:300')
    expect(result.orderId).toBe('1042')
  })

  it('uses tracking_code (not tracking_number) for trackingNumber', () => {
    const result = transformFulfillment(makeShipment(), '1042')
    expect(result.trackingNumber).toBe('TRACK123')
  })

  it('maps status strings to canonical FulfillmentStatus', () => {
    expect(transformFulfillment(makeShipment({ status: 'in_transit' }), '1').status).toBe('OPEN')
    expect(transformFulfillment(makeShipment({ status: 'delivered' }), '1').status).toBe('SUCCESS')
    expect(transformFulfillment(makeShipment({ status: 'cancelled' }), '1').status).toBe(
      'CANCELLED',
    )
    expect(transformFulfillment(makeShipment({ status: 'pending' }), '1').status).toBe('PENDING')
    expect(transformFulfillment(makeShipment({ status: 'failed' }), '1').status).toBe('FAILURE')
  })

  it('maps carrier and service', () => {
    const result = transformFulfillment(makeShipment(), '1042')
    expect(result.carrier).toBe('Correios')
    expect(result.service).toBe('PAC')
  })

  it('maps timestamp fields', () => {
    const result = transformFulfillment(makeShipment(), '1042')
    expect(result.shippedAt).toBe('2026-01-15T09:30:00.000Z')
    expect(result.estimatedDeliveryAt).toBe('2026-01-20T09:30:00.000Z')
    expect(result.createdAt).toBe('2026-01-15T09:00:00.000Z')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw, '1042')
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment(), '1042')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
