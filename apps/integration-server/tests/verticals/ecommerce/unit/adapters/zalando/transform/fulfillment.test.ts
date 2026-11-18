import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawZalandoShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/zalando/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<RawZalandoShipment> = {}): RawZalandoShipment {
  return {
    order_number: 'ORD-2026-001',
    carrier_name: 'DHL',
    tracking_number: '1234567890',
    tracking_url: 'https://www.dhl.com/track?id=1234567890',
    service_level: 'STANDARD',
    dispatch_date: '2026-01-15T09:30:00Z',
    estimated_delivery_date: '2026-01-18T09:30:00Z',
    delivery_date: null,
    status: 'DISPATCHED',
    order_unit_ids: ['unit-001', 'unit-002'],
    ...overrides,
  }
}

describe('transformFulfillment (Zalando)', () => {
  it('uses order_number as both id and orderId', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('ORD-2026-001')
    expect(result.orderId).toBe('ORD-2026-001')
  })

  it('maps carrier_name and tracking fields', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('DHL')
    expect(result.trackingNumber).toBe('1234567890')
    expect(result.trackingUrl).toBe('https://www.dhl.com/track?id=1234567890')
    expect(result.service).toBe('STANDARD')
  })

  it('maps DISPATCHED status to SUCCESS', () => {
    const result = transformFulfillment(makeShipment({ status: 'DISPATCHED' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps CREATED status to PENDING', () => {
    const result = transformFulfillment(makeShipment({ status: 'CREATED' }))
    expect(result.status).toBe('PENDING')
  })

  it('maps CANCELED status to CANCELLED', () => {
    const result = transformFulfillment(makeShipment({ status: 'CANCELED' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps FAILED status to FAILURE', () => {
    const result = transformFulfillment(makeShipment({ status: 'FAILED' }))
    expect(result.status).toBe('FAILURE')
  })

  it('defaults to OPEN for unknown status', () => {
    const result = transformFulfillment(makeShipment({ status: 'UNKNOWN_STATUS' }))
    expect(result.status).toBe('OPEN')
  })

  it('defaults to OPEN when status is null', () => {
    const result = transformFulfillment(makeShipment({ status: null }))
    expect(result.status).toBe('OPEN')
  })

  it('maps order_unit_ids to lineItems with quantity 1 each', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'unit-001', quantity: 1 })
    expect(result.lineItems![1]).toEqual({ lineItemId: 'unit-002', quantity: 1 })
  })

  it('maps dispatch_date to shippedAt', () => {
    const result = transformFulfillment(makeShipment())
    // toIsoDatetime normalises to .000Z millisecond precision
    expect(result.shippedAt).toBe('2026-01-15T09:30:00.000Z')
  })

  it('maps estimated_delivery_date to estimatedDeliveryAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.estimatedDeliveryAt).toBe('2026-01-18T09:30:00.000Z')
  })

  it('maps delivery_date to deliveredAt when present', () => {
    const result = transformFulfillment(makeShipment({ delivery_date: '2026-01-17T16:45:00Z' }))
    expect(result.deliveredAt).toBe('2026-01-17T16:45:00.000Z')
  })

  it('leaves deliveredAt undefined when delivery_date is null', () => {
    const result = transformFulfillment(makeShipment({ delivery_date: null }))
    expect(result.deliveredAt).toBeUndefined()
  })

  it('stores raw in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})

describe('untransformFulfillment (Zalando)', () => {
  it('maps carrier, trackingNumber, trackingUrl, service back to snake_case', () => {
    const body = untransformFulfillment({
      carrier: 'DHL',
      trackingNumber: '1234567890',
      trackingUrl: 'https://www.dhl.com/track?id=1234567890',
      service: 'STANDARD',
    })
    expect(body.carrier_name).toBe('DHL')
    expect(body.tracking_number).toBe('1234567890')
    expect(body.tracking_url).toBe('https://www.dhl.com/track?id=1234567890')
    expect(body.service_level).toBe('STANDARD')
  })

  it('prefers orderUnitIds over lineItems when both present', () => {
    const body = untransformFulfillment({
      orderUnitIds: ['unit-A'],
      lineItems: [{ lineItemId: 'unit-B', quantity: 1 }],
    })
    expect(body.order_unit_ids).toEqual(['unit-A'])
  })

  it('falls back to lineItems when orderUnitIds is absent', () => {
    const body = untransformFulfillment({
      lineItems: [{ lineItemId: 'unit-C', quantity: 1 }],
    })
    expect(body.order_unit_ids).toEqual(['unit-C'])
  })
})
