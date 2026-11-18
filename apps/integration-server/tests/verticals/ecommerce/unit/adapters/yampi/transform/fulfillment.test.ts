import { describe, it, expect } from 'vitest'
import {
  transformFulfillments,
  type RawWooCommerceOrderForFulfillment,
} from '../../../../../../../src/verticals/ecommerce/adapters/yampi/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(
  overrides: Partial<RawWooCommerceOrderForFulfillment> = {},
): RawWooCommerceOrderForFulfillment {
  return {
    id: 200,
    status: 'processing',
    shipping_lines: [
      {
        id: 10,
        method_id: 'flat_rate',
        method_title: 'Flat Rate',
        total: '5.00',
        tracking_number: 'TRK123',
        tracking_url: 'https://track.example.com/TRK123',
      },
    ],
    date_created_gmt: '2024-04-01T09:00:00Z',
    date_modified_gmt: '2024-04-02T09:00:00Z',
    date_completed_gmt: null,
    ...overrides,
  }
}

describe('transformFulfillments (Yampi/WooCommerce) — with shipping lines', () => {
  it('returns an array with one entry per shipping line', () => {
    const result = transformFulfillments(makeRaw())
    expect(Array.isArray(result)).toBe(true)
    expect(result).toHaveLength(1)
  })

  it('builds id as {orderId}:{shippingLineId}', () => {
    const result = transformFulfillments(makeRaw())
    expect(result[0]!.id).toBe('200:10')
    expect(result[0]!.orderId).toBe('200')
  })

  it('maps tracking fields from shipping line', () => {
    const result = transformFulfillments(makeRaw())
    expect(result[0]!.trackingNumber).toBe('TRK123')
    expect(result[0]!.trackingUrl).toBe('https://track.example.com/TRK123')
  })

  it('maps carrier from method_title and service from method_id', () => {
    const result = transformFulfillments(makeRaw())
    expect(result[0]!.carrier).toBe('Flat Rate')
    expect(result[0]!.service).toBe('flat_rate')
  })

  it('maps status "completed" to SUCCESS', () => {
    const result = transformFulfillments(makeRaw({ status: 'completed' }))
    expect(result[0]!.status).toBe('SUCCESS')
  })

  it('maps status "cancelled" to CANCELLED', () => {
    const result = transformFulfillments(makeRaw({ status: 'cancelled' }))
    expect(result[0]!.status).toBe('CANCELLED')
  })

  it('maps status "processing" to OPEN', () => {
    const result = transformFulfillments(makeRaw({ status: 'processing' }))
    expect(result[0]!.status).toBe('OPEN')
  })

  it('maps status "on-hold" to OPEN', () => {
    const result = transformFulfillments(makeRaw({ status: 'on-hold' }))
    expect(result[0]!.status).toBe('OPEN')
  })

  it('maps status "pending" to PENDING', () => {
    const result = transformFulfillments(makeRaw({ status: 'pending' }))
    expect(result[0]!.status).toBe('PENDING')
  })

  it('maps status "failed" to FAILURE', () => {
    const result = transformFulfillments(makeRaw({ status: 'failed' }))
    expect(result[0]!.status).toBe('FAILURE')
  })

  it('returns one entry per shipping line when there are multiple', () => {
    const result = transformFulfillments(
      makeRaw({
        shipping_lines: [
          { id: 10, method_title: 'Flat Rate', total: '5.00' },
          { id: 11, method_title: 'Express', total: '15.00' },
        ],
      }),
    )
    expect(result).toHaveLength(2)
    expect(result[0]!.id).toBe('200:10')
    expect(result[1]!.id).toBe('200:11')
  })

  it('uses index as lineId when shipping line has no id', () => {
    const result = transformFulfillments(
      makeRaw({
        shipping_lines: [{ method_title: 'Free Shipping', total: '0.00' }],
      }),
    )
    expect(result[0]!.id).toBe('200:0')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillments(makeRaw())
    expect(() => FulfillmentSchema.parse(result[0]!)).not.toThrow()
  })
})

describe('transformFulfillments (Yampi/WooCommerce) — empty / no shipping lines', () => {
  it('returns an array with a single synthetic entry when shipping_lines is empty', () => {
    const result = transformFulfillments(makeRaw({ shipping_lines: [] }))
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('200:default')
    expect(result[0]!.orderId).toBe('200')
  })

  it('returns synthetic entry when shipping_lines is absent', () => {
    const result = transformFulfillments(makeRaw({ shipping_lines: undefined }))
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe('200:default')
  })

  it('sets status from order status on synthetic entry', () => {
    const result = transformFulfillments(makeRaw({ shipping_lines: [], status: 'completed' }))
    expect(result[0]!.status).toBe('SUCCESS')
  })

  it('defaults status to PENDING when order status is unrecognized', () => {
    const result = transformFulfillments(makeRaw({ shipping_lines: [], status: 'unknown' }))
    expect(result[0]!.status).toBe('PENDING')
  })

  it('synthetic entry satisfies FulfillmentSchema', () => {
    const result = transformFulfillments(makeRaw({ shipping_lines: [] }))
    expect(() => FulfillmentSchema.parse(result[0]!)).not.toThrow()
  })
})
