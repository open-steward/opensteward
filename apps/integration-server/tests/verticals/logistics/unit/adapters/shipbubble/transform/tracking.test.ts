import { describe, it, expect } from 'vitest'
import { transformTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/tracking'
import type { ShipbubbleShipment } from '../../../../../../../src/verticals/logistics/adapters/shipbubble/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeShipment(overrides: Partial<ShipbubbleShipment> = {}): ShipbubbleShipment {
  return {
    order_id: 'SB-ORD-001',
    status: 'in_transit',
    courier: {
      name: 'GIG Logistics',
      tracking_code: 'GIGL1234567890',
    },
    events: [
      {
        location: 'Lagos Hub',
        message: 'Package picked up',
        captured: '2024-03-01T00:00:00Z',
      },
    ],
    date: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTrackingEvents (shipbubble)', () => {
  it('produces one event per events entry', () => {
    const result = transformTrackingEvents(makeShipment())
    expect(result).toHaveLength(1)
  })

  it('maps shipmentId from order_id', () => {
    expect(transformTrackingEvents(makeShipment())[0].shipmentId).toBe('SB-ORD-001')
  })

  it('maps trackingNumber from courier.tracking_code', () => {
    expect(transformTrackingEvents(makeShipment())[0].trackingNumber).toBe('GIGL1234567890')
  })

  it('maps carrierId from courier.name', () => {
    expect(transformTrackingEvents(makeShipment())[0].carrierId).toBe('GIG Logistics')
  })

  it('maps description from event.message', () => {
    expect(transformTrackingEvents(makeShipment())[0].description).toBe('Package picked up')
  })

  it('maps location.street1 from event.location', () => {
    expect(transformTrackingEvents(makeShipment())[0].location?.street1).toBe('Lagos Hub')
  })

  it('maps occurredAt as Date from event.captured', () => {
    expect(transformTrackingEvents(makeShipment())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to package_status when events is empty', () => {
    const raw = makeShipment({
      events: [],
      package_status: [
        { status: 'in_transit', datetime: '2024-03-01T00:00:00Z' },
        { status: 'completed', datetime: '2024-03-02T00:00:00Z' },
      ],
    })
    const result = transformTrackingEvents(raw)
    expect(result).toHaveLength(2)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[1].status).toBe('DELIVERED')
  })

  it('emits a single summary event when both events and package_status are absent', () => {
    const raw = makeShipment({ events: undefined, package_status: undefined })
    const result = transformTrackingEvents(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps all tracking statuses via package_status correctly', () => {
    const cases: [string, string][] = [
      ['pending', 'PRE_TRANSIT'],
      ['confirmed', 'PRE_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['completed', 'DELIVERED'],
      ['cancelled', 'FAILURE'],
      ['unknown_status', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({
        events: [],
        package_status: [{ status, datetime: '2024-03-01T00:00:00Z' }],
      })
      expect(transformTrackingEvents(raw)[0].status).toBe(expected)
    }
  })

  it('passes TrackingEventSchema.parse without throwing for events-path events', () => {
    const events = transformTrackingEvents(makeShipment())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
