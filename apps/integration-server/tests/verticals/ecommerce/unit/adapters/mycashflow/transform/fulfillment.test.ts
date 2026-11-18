import { describe, it, expect } from 'vitest'
import {
  transformFulfillment,
  type RawMyCashflowShipment,
} from '../../../../../../../src/verticals/ecommerce/adapters/mycashflow/transform/fulfillment'
import { FulfillmentSchema } from '../../../../../../../src/verticals/ecommerce/schema/fulfillment'

function makeRaw(overrides: Partial<RawMyCashflowShipment> = {}): RawMyCashflowShipment {
  return {
    id: 501,
    order_id: 1001,
    status: 'sent',
    tracking_number: 'TRACK456',
    tracking_url: 'https://tracking.example.com/TRACK456',
    carrier: 'Posti',
    rows: [{ id: 1, order_row_id: 5001, quantity: 2 }],
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T00:00:00Z',
    sent_at: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('transformFulfillment (MyCashflow)', () => {
  it('maps id and orderId', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(result.id).toBe('501')
    expect(result.orderId).toBe('1001')
  })

  it('maps sent status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps delivered status to SUCCESS', () => {
    const result = transformFulfillment(makeRaw({ status: 'delivered' }), '1001')
    expect(result.status).toBe('SUCCESS')
  })

  it('maps pending status to PENDING', () => {
    const result = transformFulfillment(makeRaw({ status: 'pending' }), '1001')
    expect(result.status).toBe('PENDING')
  })

  it('maps cancelled status to CANCELLED', () => {
    const result = transformFulfillment(makeRaw({ status: 'cancelled' }), '1001')
    expect(result.status).toBe('CANCELLED')
  })

  it('maps unknown non-empty status to OPEN', () => {
    const result = transformFulfillment(makeRaw({ status: 'processing' }), '1001')
    expect(result.status).toBe('OPEN')
  })

  it('maps tracking fields', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(result.trackingNumber).toBe('TRACK456')
    expect(result.trackingUrl).toBe('https://tracking.example.com/TRACK456')
    expect(result.carrier).toBe('Posti')
  })

  it('maps rows to lineItems using order_row_id', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(result.lineItems).toHaveLength(1)
    expect(result.lineItems![0]!.lineItemId).toBe('5001')
    expect(result.lineItems![0]!.quantity).toBe(2)
  })

  it('maps sent_at to shippedAt', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(result.shippedAt).toBe('2024-03-02T00:00:00Z')
  })

  it('uses orderId argument when order_id is null', () => {
    const result = transformFulfillment(makeRaw({ order_id: null }), 'FALLBACK-1001')
    expect(result.orderId).toBe('FALLBACK-1001')
  })

  it('produces a payload that satisfies FulfillmentSchema', () => {
    const result = transformFulfillment(makeRaw(), '1001')
    expect(() => FulfillmentSchema.parse(result)).not.toThrow()
  })
})
