import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  transformShipmentEvents,
  type TerminalAfricaTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/terminal-africa/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { confirmedShipment, draftShipment } from '../fixtures'

// trackingevent.ts is a thin re-export of tracking.ts; verify the re-export works correctly.

function makeResponse(
  overrides: Partial<TerminalAfricaTrackingResponse> = {},
): TerminalAfricaTrackingResponse {
  return {
    shipment_id: 'shp-001',
    carrier_tracking_number: 'TRK999',
    carrier_slug: 'dhl',
    status: 'delivered',
    events: [
      {
        status: 'delivered',
        description: 'Package delivered',
        created_at: '2024-03-02T00:00:00Z',
      },
    ],
    created_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('terminal-africa trackingevent re-export', () => {
  it('re-exports transformTrackingEvents and maps correctly', () => {
    const r = transformTrackingEvents(makeResponse())
    expect(r).toHaveLength(1)
    expect(r[0].status).toBe('DELIVERED')
    expect(r[0].shipmentId).toBe('shp-001')
    expect(r[0].trackingNumber).toBe('TRK999')
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvents(makeResponse())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})

describe('terminal-africa transformShipmentEvents (v1 shipment `events`)', () => {
  it('maps the documented event of the confirmed example shipment', () => {
    const out = transformShipmentEvents(confirmedShipment()).map((e) =>
      TrackingEventSchema.parse(e),
    )
    expect(out).toHaveLength(1)
    expect(out[0]).toMatchObject({
      id: 'SH-02314736509:2022-11-22T02:03:23.553Z:confirmed',
      shipmentId: 'SH-02314736509',
      trackingNumber: '2604444253',
      carrierId: 'CA-81957188177',
      status: 'PRE_TRANSIT',
      description: 'Shipment arranged by Ada Obi',
    })
    expect(out[0].occurredAt?.toISOString()).toBe('2022-11-22T02:03:23.553Z')
    expect(out[0].location).toBeUndefined()
    expect(out[0].metadata?.location).toBe('Victoria Island, NG')
  })

  it('a shipment with `events: []` yields no events (no status-derived stand-in)', () => {
    expect(transformShipmentEvents(draftShipment())).toEqual([])
  })

  it('a shipment without shipment_id yields no events (no id to build them on)', () => {
    const raw = confirmedShipment()
    delete raw.shipment_id
    expect(transformShipmentEvents(raw)).toEqual([])
  })

  it('skips an event without created_at rather than invent its time', () => {
    const raw = confirmedShipment()
    raw.events = [{ status: 'in-transit', description: 'no time' }]
    expect(transformShipmentEvents(raw)).toEqual([])
  })

  it.each([
    ['in-transit', 'IN_TRANSIT'],
    ['delivered', 'DELIVERED'],
    ['cancelled', 'FAILURE'],
    ['something-else', 'UNKNOWN'],
  ])('event status %s -> %s', (status, expected) => {
    const raw = confirmedShipment()
    raw.events = [{ created_at: '2022-11-23T02:03:23.553Z', status }]
    expect(TrackingEventSchema.parse(transformShipmentEvents(raw)[0]).status).toBe(expected)
  })
})
