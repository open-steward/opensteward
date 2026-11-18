import { describe, it, expect } from 'vitest'
import {
  transformFulfillmentFromOrder,
  type RawInsalesFulfillmentInfo,
} from '../../../../../../../src/verticals/ecommerce/adapters/insales/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeFulfillmentInfo(
  overrides: Partial<RawInsalesFulfillmentInfo> = {},
): RawInsalesFulfillmentInfo {
  return {
    order_id: 9001,
    fulfillment_status: 'delivered',
    tracking_number: 'RU123456789RU',
    delivery_title: 'СДЭК',
    delivered_at: '2024-03-05T00:00:00Z',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillmentFromOrder (insales)', () => {
  it('synthesises id as ful_order_<order_id>', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.id).toBe('ful_order_9001')
  })

  it('maps orderId as string', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.orderId).toBe('9001')
  })

  it('maps delivered → SUCCESS status', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.status).toBe('SUCCESS')
  })

  it('maps all insales statuses to canonical', () => {
    const cases: [string, string][] = [
      ['new', 'PENDING'],
      ['in_progress', 'OPEN'],
      ['delivered', 'SUCCESS'],
      ['cancelled', 'CANCELLED'],
    ]
    for (const [raw, expected] of cases) {
      const result = transformFulfillmentFromOrder(makeFulfillmentInfo({ fulfillment_status: raw }))
      expect(result.status).toBe(expected)
    }
  })

  it('maps trackingNumber and carrier', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.trackingNumber).toBe('RU123456789RU')
    expect(result.carrier).toBe('СДЭК')
  })

  it('maps deliveredAt', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.deliveredAt).toBe('2024-03-05T00:00:00Z')
  })

  it('maps createdAt and updatedAt', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo())
    expect(result.createdAt).toBe('2024-03-01T00:00:00Z')
    expect(result.updatedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('returns undefined status for unknown fulfillment_status', () => {
    const result = transformFulfillmentFromOrder(
      makeFulfillmentInfo({ fulfillment_status: 'unknown_value' }),
    )
    expect(result.status).toBeUndefined()
  })

  it('returns undefined status when fulfillment_status is null', () => {
    const result = transformFulfillmentFromOrder(makeFulfillmentInfo({ fulfillment_status: null }))
    expect(result.status).toBeUndefined()
  })

  it('preserves raw payload in metadata and produces a schema-valid result', () => {
    const raw = makeFulfillmentInfo()
    const result = transformFulfillmentFromOrder(raw)
    expect(result.metadata).toBe(raw)
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
