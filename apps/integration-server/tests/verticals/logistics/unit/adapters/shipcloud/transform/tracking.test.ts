import { describe, it, expect } from 'vitest'
import { transformTrackingEvents } from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/tracking'
import type { ShipcloudShipment } from '../../../../../../../src/verticals/logistics/adapters/shipcloud/transform/shipment'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeShipment(overrides: Partial<ShipcloudShipment> = {}): ShipcloudShipment {
  return {
    id: 'sc-shp-001',
    carrier_tracking_no: 'JD000300006123456789',
    label_url: 'https://api.shipcloud.io/v1/shipments/sc-shp-001/label',
    carrier: 'dhl',
    service: 'standard',
    packages: [
      {
        id: 'pkg-001',
        weight: 1,
        length: 20,
        width: 15,
        height: 10,
        tracking_events: [
          {
            id: 'evt-001',
            timestamp: '2024-03-01T00:00:00Z',
            location: 'Hamburg',
            status: 'picked_up',
            details: 'Package picked up',
          },
          {
            id: 'evt-002',
            timestamp: '2024-03-02T00:00:00Z',
            location: 'Frankfurt Hub',
            status: 'transit',
            details: 'In transit',
          },
        ],
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('transformTrackingEvents (shipcloud)', () => {
  it('produces one event per package tracking_event', () => {
    expect(transformTrackingEvents(makeShipment())).toHaveLength(2)
  })

  it('maps shipmentId from shipment id', () => {
    expect(transformTrackingEvents(makeShipment())[0].shipmentId).toBe('sc-shp-001')
  })

  it('maps trackingNumber from carrier_tracking_no', () => {
    expect(transformTrackingEvents(makeShipment())[0].trackingNumber).toBe('JD000300006123456789')
  })

  it('maps carrierId from carrier field', () => {
    expect(transformTrackingEvents(makeShipment())[0].carrierId).toBe('dhl')
  })

  it('maps status: picked_up → IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeShipment())[0].status).toBe('IN_TRANSIT')
  })

  it('maps description from details', () => {
    expect(transformTrackingEvents(makeShipment())[0].description).toBe('Package picked up')
  })

  it('maps location.city from location string', () => {
    expect(transformTrackingEvents(makeShipment())[0].location?.city).toBe('Hamburg')
  })

  it('maps occurredAt as Date from timestamp', () => {
    expect(transformTrackingEvents(makeShipment())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises a PRE_TRANSIT stub when no tracking events but label_url present', () => {
    const raw = makeShipment({
      packages: [{ id: 'p', weight: 1, length: 10, width: 10, height: 10, tracking_events: [] }],
    })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('PRE_TRANSIT')
  })

  it('returns empty array when no events and no label_url', () => {
    const raw = makeShipment({
      label_url: null,
      packages: [{ id: 'p', weight: 1, length: 10, width: 10, height: 10, tracking_events: [] }],
    })
    expect(transformTrackingEvents(raw)).toHaveLength(0)
  })

  it('maps all tracking statuses correctly', () => {
    const cases: [string, string][] = [
      ['label_created', 'PRE_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['awaits_pickup_by_receiver', 'AVAILABLE_FOR_PICKUP'],
      ['canceled', 'RETURN_TO_SENDER'],
      ['delayed', 'IN_TRANSIT'],
      ['exception', 'FAILURE'],
      ['not_delivered', 'FAILURE'],
      ['destroyed', 'FAILURE'],
      ['return_to_sender', 'RETURN_TO_SENDER'],
      ['unknown', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeShipment({
        packages: [
          {
            id: 'p',
            weight: 1,
            length: 10,
            width: 10,
            height: 10,
            tracking_events: [{ timestamp: '2024-03-01T00:00:00Z', status }],
          },
        ],
      })
      expect(transformTrackingEvents(raw)[0].status).toBe(expected)
    }
  })

  it('passes TrackingEventSchema.parse without throwing', () => {
    for (const event of transformTrackingEvents(makeShipment())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
