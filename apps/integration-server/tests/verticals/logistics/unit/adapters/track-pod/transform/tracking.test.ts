import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/tracking'
import type { TrackPodOrder } from '../../../../../../../src/verticals/logistics/adapters/track-pod/transform/order'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeOrder(overrides: Partial<TrackPodOrder> = {}): TrackPodOrder {
  return {
    Id: 'ord-001',
    Number: 'ORD-001',
    TrackId: 'TRK-001',
    Date: '2024-03-01T00:00:00Z',
    Status: 'delivered',
    ContactName: 'Alice Smith',
    ...overrides,
  }
}

describe('track-pod transformTracking', () => {
  it('returns exactly one event (snapshot model)', () => {
    const r = transformTracking(makeOrder())
    expect(r).toHaveLength(1)
  })

  it('maps Id → shipmentId', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].shipmentId).toBe('ord-001')
  })

  it('falls back to TrackId for shipmentId when Id absent', () => {
    const r = transformTracking(makeOrder({ Id: null }))
    expect(r[0].shipmentId).toBe('TRK-001')
  })

  it('maps TrackId → trackingNumber', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].trackingNumber).toBe('TRK-001')
  })

  it('falls back to Number for trackingNumber when TrackId absent', () => {
    const r = transformTracking(makeOrder({ TrackId: null }))
    expect(r[0].trackingNumber).toBe('ORD-001')
  })

  it('hardcodes carrierId to track-pod', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].carrierId).toBe('track-pod')
  })

  it('maps delivered → DELIVERED', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].status).toBe('DELIVERED')
  })

  it('maps Status → description', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].description).toBe('delivered')
  })

  it('maps Date → occurredAt as Date', () => {
    const r = transformTracking(makeOrder())
    expect(r[0].occurredAt).toBeInstanceOf(Date)
    expect(r[0].occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['delivered', 'DELIVERED'],
      ['collected', 'DELIVERED'],
      ['not delivered', 'FAILURE'],
      ['not collected', 'FAILURE'],
      ['rejected', 'FAILURE'],
      ['in progress', 'OUT_FOR_DELIVERY'],
      ['active', 'OUT_FOR_DELIVERY'],
      ['partially', 'OUT_FOR_DELIVERY'],
      ['scheduled', 'PRE_TRANSIT'],
      ['unscheduled', 'PRE_TRANSIT'],
      ['pending', 'PRE_TRANSIT'],
      ['bogus', 'IN_TRANSIT'],
    ]
    for (const [s, expected] of cases) {
      const r = transformTracking(makeOrder({ Status: s }))
      expect(r[0].status, `status: ${s}`).toBe(expected)
    }
  })

  it('metadata references the raw object', () => {
    const raw = makeOrder()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTracking(makeOrder())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('handles null Date → undefined occurredAt', () => {
    const r = transformTracking(makeOrder({ Date: null }))
    expect(r[0].occurredAt).toBeUndefined()
    expect(() => TrackingEventSchema.parse(r[0])).not.toThrow()
  })
})
