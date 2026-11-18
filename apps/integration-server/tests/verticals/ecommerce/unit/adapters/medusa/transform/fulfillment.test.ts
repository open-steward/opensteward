import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawMedusaFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/medusa/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillment(
  overrides: Partial<RawMedusaFulfillment> = {},
): RawMedusaFulfillment {
  return {
    id: 'ful_01',
    order_id: 'order_01',
    status: 'shipped',
    tracking_numbers: ['1Z999AA10123456784'],
    tracking_links: [
      { url: 'https://track.example.com/1Z999AA10123456784', tracking_number: '1Z999AA10123456784' },
    ],
    provider_id: 'ups',
    location_id: 'sloc_01',
    items: [
      { item_id: 'item_01', quantity: 2 },
    ],
    shipped_at: '2024-05-02T10:00:00Z',
    created_at: '2024-05-01T10:00:00Z',
    updated_at: '2024-05-02T10:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (Medusa v2)', () => {
  it('maps core fields', () => {
    const result = transformFulfillment(makeFulfillment(), 'order_01')
    expect(result.id).toBe('ful_01')
    expect(result.orderId).toBe('order_01')
    expect(result.status).toBe('SUCCESS')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.trackingUrl).toBe('https://track.example.com/1Z999AA10123456784')
    expect(result.carrier).toBe('ups')
    expect(result.locationId).toBe('sloc_01')
  })

  it('maps all status values', () => {
    const cases: Array<[string, string]> = [
      ['created', 'OPEN'],
      ['shipped', 'SUCCESS'],
      ['delivered', 'SUCCESS'],
      ['canceled', 'CANCELLED'],
      ['requires_action', 'PENDING'],
    ]
    for (const [medusaStatus, expected] of cases) {
      const r = transformFulfillment(makeFulfillment({ status: medusaStatus }), 'order_01')
      expect(r.status).toBe(expected)
    }
  })

  it('maps line items', () => {
    const result = transformFulfillment(makeFulfillment(), 'order_01')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]).toEqual({ lineItemId: 'item_01', quantity: 2 })
  })

  it('handles fulfillment without tracking', () => {
    const result = transformFulfillment(
      makeFulfillment({ tracking_numbers: undefined, tracking_links: null }),
      'order_01',
    )
    expect(result.trackingNumber).toBeUndefined()
    expect(result.trackingUrl).toBeUndefined()
  })

  it('preserves raw payload in metadata', () => {
    const raw = makeFulfillment()
    const result = transformFulfillment(raw, 'order_01')
    expect(result.metadata).toBe(raw)
  })

  it('produces a schema-valid result', () => {
    const result = transformFulfillment(makeFulfillment(), 'order_01')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })

  it('untransforms correctly', () => {
    const body = untransformFulfillment({
      locationId: 'sloc_01',
      trackingNumber: '1Z999AA10123456784',
      lineItems: [{ lineItemId: 'item_01', quantity: 2 }],
    })
    expect(body['location_id']).toBe('sloc_01')
    expect(body['tracking_numbers']).toEqual(['1Z999AA10123456784'])
    const items = body['items'] as Array<{ item_id: string; quantity: number }>
    expect(items[0]).toEqual({ item_id: 'item_01', quantity: 2 })
  })
})
