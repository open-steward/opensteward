import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  untransformFulfillment,
  type RawWooCommerceOrderForFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/fnac-marketplace/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(
  overrides: Partial<RawWooCommerceOrderForFulfillment> = {},
): RawWooCommerceOrderForFulfillment {
  return {
    id: 9001,
    status: 'completed',
    date_completed_gmt: '2024-03-03T00:00:00Z',
    date_modified_gmt: '2024-03-02T00:00:00Z',
    shipping_lines: [
      {
        id: 1,
        method_title: 'Colissimo',
        meta_data: [
          { key: '_tracking_number', value: 'COL123' },
          { key: '_tracking_carrier', value: 'La Poste' },
          { key: '_tracking_link', value: 'https://track.laposte.fr/COL123' },
        ],
      },
    ],
    ...overrides,
  }
}

describe('transformFulfillment (FNAC/WooCommerce)', () => {
  it('maps composite id from orderId and shipping line id', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.id).toBe('9001:1')
    expect(result.orderId).toBe('9001')
  })

  it('falls back to default id when no shipping line id', () => {
    const result = transformFulfillment(
      makeRaw({
        shipping_lines: [{ method_title: 'Standard' }],
      }),
    )
    expect(result.id).toBe('9001:default')
  })

  it('maps completed status → SUCCESS', () => {
    const result = transformFulfillment(makeRaw({ status: 'completed' }))
    expect(result.status).toBe('SUCCESS')
  })

  it('maps processing status → OPEN', () => {
    const result = transformFulfillment(makeRaw({ status: 'processing' }))
    expect(result.status).toBe('OPEN')
  })

  it('maps cancelled status → CANCELLED', () => {
    const result = transformFulfillment(makeRaw({ status: 'cancelled' }))
    expect(result.status).toBe('CANCELLED')
  })

  it('maps tracking info from meta_data', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.trackingNumber).toBe('COL123')
    expect(result.carrier).toBe('La Poste')
    expect(result.trackingUrl).toBe('https://track.laposte.fr/COL123')
  })

  it('maps service from method_title', () => {
    const result = transformFulfillment(makeRaw())
    expect(result.service).toBe('Colissimo')
  })

  it('sets deliveredAt only when status is completed', () => {
    const completed = transformFulfillment(makeRaw({ status: 'completed' }))
    expect(completed.deliveredAt).toBeDefined()

    const processing = transformFulfillment(makeRaw({ status: 'processing' }))
    expect(processing.deliveredAt).toBeUndefined()
  })

  it('round-trips via untransformFulfillment with tracking', () => {
    const result = transformFulfillment(makeRaw())
    const body = untransformFulfillment(result)
    expect(body.status).toBe('completed')
    expect((body.shipping_lines as any[])[0].meta_data[0].value).toBe('COL123')
  })

  it('produces a payload satisfying FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw())
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
