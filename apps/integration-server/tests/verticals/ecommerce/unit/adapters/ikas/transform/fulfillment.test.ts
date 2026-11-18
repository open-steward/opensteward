import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawIkasOrderPackage,
} from '../../../../../../../src/verticals/ecommerce/adapters/ikas/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makePackage(overrides: Partial<RawIkasOrderPackage> = {}): RawIkasOrderPackage {
  return {
    id: 'pkg-001',
    orderId: 'ord-999',
    status: 'SHIPPED',
    trackingInfo: {
      trackingNumber: '1Z999AA10123456784',
      trackingUrl: 'https://track.example.com/1Z999AA10123456784',
      shippingCompany: 'UPS',
    },
    lines: [
      { orderLineItemId: 'li-111', quantity: 2 },
      { orderLineItemId: 'li-222', quantity: 1 },
    ],
    stockLocationId: 'loc-istanbul',
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (ikas)', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makePackage())
    expect(result.id).toBe('pkg-001')
    expect(result.orderId).toBe('ord-999')
  })

  it('maps SHIPPED → SUCCESS status', () => {
    const result = transformFulfillment(makePackage())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all ikas statuses to canonical equivalents', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PENDING'],
      ['PREPARING', 'OPEN'],
      ['READY', 'OPEN'],
      ['SHIPPED', 'SUCCESS'],
      ['DELIVERED', 'SUCCESS'],
      ['CANCELLED', 'CANCELLED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformFulfillment(makePackage({ status: raw }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps tracking fields from trackingInfo', () => {
    const result = transformFulfillment(makePackage())
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://track.example.com/1Z999AA10123456784')
    expect(result.carrier).toBe('UPS')
  })

  it('maps line items from lines', () => {
    const result = transformFulfillment(makePackage())
    expect(result.lineItems).toHaveLength(2)
    expect(result.lineItems![0]!.lineItemId).toBe('li-111')
    expect(result.lineItems![0]!.quantity).toBe(2)
    expect(result.lineItems![1]!.lineItemId).toBe('li-222')
  })

  it('maps locationId from stockLocationId', () => {
    const result = transformFulfillment(makePackage())
    expect(result.locationId).toBe('loc-istanbul')
  })

  it('falls back to orderId parameter when raw.orderId is null', () => {
    const result = transformFulfillment(makePackage({ orderId: null }), 'ord-fallback')
    expect(result.orderId).toBe('ord-fallback')
  })

  it('omits lineItems when lines is empty', () => {
    const result = transformFulfillment(makePackage({ lines: [] }))
    expect(result.lineItems).toBeUndefined()
  })

  it('filters line items with null orderLineItemId to empty array', () => {
    // mapLineItems early-returns undefined only for empty input;
    // when items exist but all are filtered, it returns [].
    const result = transformFulfillment(
      makePackage({ lines: [{ orderLineItemId: null, quantity: 1 }] }),
    )
    expect(result.lineItems).toEqual([])
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformFulfillment(makePackage())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-01T00:00:00Z')
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makePackage()
    const result = transformFulfillment(raw)
    expect(result.metadata).toBe(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('round-trips via untransformFulfillment', () => {
    const canonical = transformFulfillment(makePackage())
    const body = untransformFulfillment(canonical)
    expect((body['trackingInfo'] as Record<string, unknown>)['trackingNumber']).toBe(
      '1Z999AA10123456784',
    )
    expect((body['trackingInfo'] as Record<string, unknown>)['shippingCompany']).toBe('UPS')
  })
})
