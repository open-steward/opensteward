import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type ShuupShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/shuup/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeShipment(overrides: Partial<ShuupShipment> = {}): ShuupShipment {
  return {
    id: 10,
    order: 456,
    status: 'sent',
    tracking_code: '1Z999AA10123456784',
    tracking_url: 'https://track.example.com/1Z999AA10123456784',
    carrier: 'UPS',
    service_name: 'UPS Ground',
    created_on: '2024-01-05T08:00:00Z',
    shipped_at: '2024-01-05T10:00:00Z',
    products: [
      { product: 123, quantity: 2 },
      { product: 456, quantity: 1 },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (Shuup)', () => {
  it('maps core fields and stringifies ids', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.id).toBe('10')
    expect(typeof result.id).toBe('string')
    expect(result.orderId).toBe('456')
    expect(typeof result.orderId).toBe('string')
  })

  it('maps tracking_code to trackingNumber', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
  })

  it('maps tracking_url to trackingUrl', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.trackingUrl).toBe('https://track.example.com/1Z999AA10123456784')
  })

  it('maps carrier', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.carrier).toBe('UPS')
  })

  it('maps service_name to service', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.service).toBe('UPS Ground')
  })

  it('maps status sent → SUCCESS', () => {
    expect(transformFulfillment(makeShipment({ status: 'sent' })).status).toBe('SUCCESS')
  })

  it('maps status received → SUCCESS', () => {
    expect(transformFulfillment(makeShipment({ status: 'received' })).status).toBe('SUCCESS')
  })

  it('maps status not_sent → OPEN', () => {
    expect(transformFulfillment(makeShipment({ status: 'not_sent' })).status).toBe('OPEN')
  })

  it('maps status cancelled → CANCELLED', () => {
    expect(transformFulfillment(makeShipment({ status: 'cancelled' })).status).toBe('CANCELLED')
  })

  it('maps status error → ERROR', () => {
    expect(transformFulfillment(makeShipment({ status: 'error' })).status).toBe('ERROR')
  })

  it('maps null status → PENDING', () => {
    expect(transformFulfillment(makeShipment({ status: null })).status).toBe('PENDING')
  })

  it('maps products to lineItems', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]).toEqual({ lineItemId: '123', quantity: 2 })
    expect(result.lineItems![1]).toEqual({ lineItemId: '456', quantity: 1 })
  })

  it('handles string quantities in products', () => {
    const result = transformFulfillment(
      makeShipment({ products: [{ product: 789, quantity: '3.000' }] }),
    )
    expect(result.lineItems![0]!.quantity).toBe(3)
  })

  it('handles empty products array', () => {
    const result = transformFulfillment(makeShipment({ products: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('maps shipped_at to shippedAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.shippedAt).toBe('2024-01-05T10:00:00Z')
  })

  it('falls back to created_on for shippedAt when shipped_at is absent', () => {
    const result = transformFulfillment(makeShipment({ shipped_at: null }))
    expect(result.shippedAt).toBe('2024-01-05T08:00:00Z')
  })

  it('maps created_on to createdAt', () => {
    const result = transformFulfillment(makeShipment())
    expect(result.createdAt).toBe('2024-01-05T08:00:00Z')
  })

  it('handles missing order id gracefully', () => {
    const result = transformFulfillment(makeShipment({ order: null }))
    expect(result.orderId).toBe('unknown')
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeShipment()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeShipment())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
