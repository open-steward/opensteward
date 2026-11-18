import { describe, it, expect } from 'vitest'
import { transformTracking } from '../../../../../../../src/verticals/logistics/adapters/senpex/transform/tracking'
import type { SenpexOrder } from '../../../../../../../src/verticals/logistics/adapters/senpex/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOrder(overrides: Partial<SenpexOrder> = {}): SenpexOrder {
  return {
    id: 'senpex-777',
    order_name: 'Multi-stop Order',
    status: 1630,
    pack_from_text: '1 Origin Ave',
    routes: [
      {
        id: 'rt-1',
        route_to_text: '10 Stop One',
        rec_name: 'Alice',
        rec_phone: 4155550001,
        route_status: 1,
        delivered_at: null,
      },
      {
        id: 'rt-2',
        route_to_text: '20 Stop Two',
        rec_name: 'Bob',
        rec_phone: 4155550002,
        route_status: 2,
        delivered_at: '2024-03-02T14:00:00Z',
      },
    ],
    order_price: 30,
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T10:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('returns 1 + N events (1 order-level + N route events)', () => {
    const events = transformTracking(makeOrder())
    // 1 order-level + 2 routes
    expect(events).toHaveLength(3)
  })

  it('first event maps order-level status and trackingNumber', () => {
    // makeOrder uses status=1630; source: s < 1630 → IN_TRANSIT, s < 1700 → OUT_FOR_DELIVERY
    // so 1630 → OUT_FOR_DELIVERY
    const event = transformTracking(makeOrder())[0]
    expect(event.trackingNumber).toBe('senpex-777')
    expect(event.carrierId).toBe('senpex')
    expect(event.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps senpex status codes on order-level event', () => {
    // Boundary table from tracking.ts mapStatus():
    //   s < 1500 → PRE_TRANSIT
    //   s < 1630 → IN_TRANSIT  (1500–1629)
    //   s < 1700 → OUT_FOR_DELIVERY  (1630, 1670)
    //   s === 1700 → DELIVERED
    //   s === -1 → FAILURE
    const cases: [number | string, string][] = [
      [1000, 'PRE_TRANSIT'],
      [1499, 'PRE_TRANSIT'],
      [1500, 'IN_TRANSIT'],
      [1629, 'IN_TRANSIT'],
      [1630, 'OUT_FOR_DELIVERY'],
      [1670, 'OUT_FOR_DELIVERY'],
      [1700, 'DELIVERED'],
      [-1, 'FAILURE'],
    ]
    for (const [status, expected] of cases) {
      expect(transformTracking(makeOrder({ status }))[0].status).toBe(expected)
    }
  })

  it('route with route_status=2 gets status DELIVERED', () => {
    const events = transformTracking(makeOrder())
    // rt-2 is route_status=2 → DELIVERED
    const rt2 = events.find((e) => e.id === 'rt-2')
    expect(rt2?.status).toBe('DELIVERED')
  })

  it('route with route_status!=2 inherits order status', () => {
    // status=1630 maps to OUT_FOR_DELIVERY (s < 1700, not s < 1630)
    const events = transformTracking(makeOrder({ status: 1630 }))
    const rt1 = events.find((e) => e.id === 'rt-1')
    expect(rt1?.status).toBe('OUT_FOR_DELIVERY')
  })

  it('route description maps route_status number to text', () => {
    const events = transformTracking(makeOrder())
    const rt1 = events.find((e) => e.id === 'rt-1')
    const rt2 = events.find((e) => e.id === 'rt-2')
    expect(rt1?.description).toBe('Taken by courier')
    expect(rt2?.description).toBe('Delivered')
  })

  it('maps route location from route_to_text', () => {
    const events = transformTracking(makeOrder())
    const rt1 = events.find((e) => e.id === 'rt-1')
    expect(rt1?.location?.street1).toBe('10 Stop One')
  })

  it('parses route delivered_at → occurredAt', () => {
    const events = transformTracking(makeOrder())
    const rt2 = events.find((e) => e.id === 'rt-2')
    expect(rt2?.occurredAt).toBeInstanceOf(Date)
  })

  it('handles empty routes array (only order-level event)', () => {
    const events = transformTracking(makeOrder({ routes: [] }))
    expect(events).toHaveLength(1)
  })

  it('handles null routes (only order-level event)', () => {
    const events = transformTracking(makeOrder({ routes: null }))
    expect(events).toHaveLength(1)
  })

  it('each event passes TrackingEventSchema', () => {
    const events = transformTracking(makeOrder())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('order-level event metadata is the raw order', () => {
    const raw = makeOrder()
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })
})
