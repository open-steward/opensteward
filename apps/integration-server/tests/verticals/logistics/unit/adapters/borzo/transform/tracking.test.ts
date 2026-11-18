import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/borzo/transform/tracking'
import type { BorzoOrder } from '../../../../../../../src/verticals/logistics/adapters/borzo/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(overrides: Partial<BorzoOrder> = {}): BorzoOrder {
  return {
    order_id: 98765,
    order_name: 'BORZO-98765',
    status: 'active',
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTracking (borzo)', () => {
  it('always returns exactly one event', () => {
    expect(transformTracking(makeOrder())).toHaveLength(1)
  })

  it('sets carrierId to borzo', () => {
    expect(transformTracking(makeOrder())[0].carrierId).toBe('borzo')
  })

  it('uses order_name as trackingNumber', () => {
    expect(transformTracking(makeOrder())[0].trackingNumber).toBe('BORZO-98765')
  })

  it('falls back to string order_id when order_name is null', () => {
    const event = transformTracking(makeOrder({ order_name: null }))[0]
    expect(event.trackingNumber).toBe('98765')
  })

  it('maps status active → IN_TRANSIT', () => {
    expect(transformTracking(makeOrder({ status: 'active' }))[0].status).toBe('IN_TRANSIT')
  })

  it('maps status new → PRE_TRANSIT', () => {
    expect(transformTracking(makeOrder({ status: 'new' }))[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status completed → DELIVERED', () => {
    expect(transformTracking(makeOrder({ status: 'completed' }))[0].status).toBe('DELIVERED')
  })

  it('maps status canceled → FAILURE', () => {
    expect(transformTracking(makeOrder({ status: 'canceled' }))[0].status).toBe('FAILURE')
  })

  it('maps status delayed → IN_TRANSIT', () => {
    expect(transformTracking(makeOrder({ status: 'delayed' }))[0].status).toBe('IN_TRANSIT')
  })

  it('maps unknown status → UNKNOWN', () => {
    expect(transformTracking(makeOrder({ status: 'unknown_val' }))[0].status).toBe('UNKNOWN')
  })

  it('includes a description for known statuses', () => {
    const event = transformTracking(makeOrder({ status: 'active' }))[0]
    expect(typeof event.description).toBe('string')
    expect(event.description!.length).toBeGreaterThan(0)
  })

  it('passes metadata as original raw object', () => {
    const raw = makeOrder()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('produces output that parses against TrackingEventSchema', () => {
    const events = transformTracking(makeOrder())
    for (const e of events) {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    }
  })
})
