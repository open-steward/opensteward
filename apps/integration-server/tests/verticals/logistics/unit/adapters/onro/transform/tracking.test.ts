import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type OnroOrder,
  type OnroOrderEvent,
} from '../../../../../../../src/verticals/logistics/adapters/onro/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeOnroOrder(overrides: Partial<OnroOrder> = {}): OnroOrder {
  return {
    id: 'ord-5678',
    order_id: 'EXT-REF-42',
    status: 'in_transit',
    created_at: '2024-03-01T00:00:00Z',
    updated_at: '2024-03-02T10:00:00Z',
    ...overrides,
  }
}

function makeEvent(overrides: Partial<OnroOrderEvent> = {}): OnroOrderEvent {
  return {
    status: 'in_transit',
    description: 'Parcel is on the way',
    timestamp: '2024-03-02T10:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('returns a single synthetic event when events array is absent', () => {
    const raw = makeOnroOrder()
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
  })

  it('synthetic event maps shipmentId, trackingNumber and carrierId', () => {
    const raw = makeOnroOrder()
    const [event] = transformTracking(raw)

    expect(event.shipmentId).toBe('ord-5678')
    expect(event.trackingNumber).toBe('EXT-REF-42')
    expect(event.carrierId).toBe('onro')
  })

  it('synthetic event maps status from order status', () => {
    const raw = makeOnroOrder({ status: 'delivered' })
    const [event] = transformTracking(raw)
    expect(event.status).toBe('DELIVERED')
  })

  it('synthetic event uses updated_at for occurredAt', () => {
    const raw = makeOnroOrder()
    const [event] = transformTracking(raw)
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-02T10:00:00.000Z')
  })

  it('falls back to created_at when updated_at is absent', () => {
    const raw = makeOnroOrder({ updated_at: null })
    const [event] = transformTracking(raw)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to id as trackingNumber when order_id is absent', () => {
    const raw = makeOnroOrder({ order_id: null })
    const [event] = transformTracking(raw)
    expect(event.trackingNumber).toBe('ord-5678')
  })

  it('returns one event per entry in events array', () => {
    const raw = makeOnroOrder({
      events: [
        makeEvent(),
        makeEvent({
          status: 'delivered',
          description: 'Delivered',
          timestamp: '2024-03-03T14:00:00Z',
        }),
      ],
    })
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('event-level event maps description and occurredAt', () => {
    const raw = makeOnroOrder({
      events: [makeEvent({ description: 'On the way', timestamp: '2024-03-02T10:00:00Z' })],
    })
    const [event] = transformTracking(raw)

    expect(event.description).toBe('On the way')
    expect(event.occurredAt).toBeInstanceOf(Date)
    expect(event.occurredAt?.toISOString()).toBe('2024-03-02T10:00:00.000Z')
  })

  it('event-level event falls back to order status when event status is null', () => {
    const raw = makeOnroOrder({
      status: 'pending',
      events: [makeEvent({ status: null })],
    })
    const [event] = transformTracking(raw)
    expect(event.status).toBe('PRE_TRANSIT')
  })

  it('maps all status strings correctly', () => {
    const cases: [string, string][] = [
      ['pickedup', 'IN_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['on_the_way', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivering', 'OUT_FOR_DELIVERY'],
      ['near_customer', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['completed', 'DELIVERED'],
      ['failed', 'FAILURE'],
      // 'undelivered' contains 'delivered' so the DELIVERED branch fires first (source quirk)
      ['undelivered', 'DELIVERED'],
      ['cancelled', 'FAILURE'],
      ['canceled', 'FAILURE'],
      ['pending', 'PRE_TRANSIT'],
      ['created', 'PRE_TRANSIT'],
      ['assigned', 'PRE_TRANSIT'],
      ['accepted', 'PRE_TRANSIT'],
      ['something_random', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeOnroOrder({ events: [makeEvent({ status })] })
      expect(transformTracking(raw)[0].status, `status: ${status}`).toBe(expected)
    }
  })

  it('each event result passes TrackingEventSchema.parse without throwing', () => {
    const raw = makeOnroOrder({
      events: [
        makeEvent(),
        makeEvent({ status: 'delivered', description: 'Done', timestamp: '2024-03-03T08:00:00Z' }),
      ],
    })
    const events = transformTracking(raw)
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })

  it('synthetic fallback event passes TrackingEventSchema.parse without throwing', () => {
    const raw = makeOnroOrder()
    const [event] = transformTracking(raw)
    expect(() => TrackingEventSchema.parse(event)).not.toThrow()
  })
})
