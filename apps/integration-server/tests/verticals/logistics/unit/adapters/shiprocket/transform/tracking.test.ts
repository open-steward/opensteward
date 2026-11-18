import { describe, it, expect, vi, beforeEach } from 'vitest'

const { getMock } = vi.hoisted(() => ({ getMock: vi.fn() }))

vi.mock('../../../../../../../src/verticals/logistics/adapters/shiprocket/client', () => ({
  ShiprocketClient: class {
    get = getMock
  },
}))

import {
  transformTracking,
  type ShiprocketTrackingData,
} from '../../../../../../../src/verticals/logistics/adapters/shiprocket/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { ShiprocketAdapter } from '../../../../../../../src/verticals/logistics/adapters/shiprocket'
import type { Credentials } from '../../../../../../../src/verticals/logistics/adapter/interface'

/**
 * `courier/track/shipment/{shipment_id}` takes a Shiprocket shipment id, but
 * getTrackingEvents is only handed a tracking (AWB) number — so the old code
 * was resolving the wrong resource. `courier/track/awb/{awb_code}` is keyed
 * by tracking number and returns the same envelope
 * `{tracking_data: {shipment_track[], shipment_track_activities[]}}`.
 *
 * The real shipment id lives on `shipment_track[0].shipment_id` — a
 * different field from `shipment_track[0].id` — not on the route argument.
 */

const AWB = 'DLV123456'

function makeTrackingData(overrides: Partial<ShiprocketTrackingData> = {}): ShiprocketTrackingData {
  return {
    tracking_data: {
      track_status: 1,
      shipment_status: 7,
      shipment_track: [
        {
          id: 9001,
          shipment_id: 5001,
          awb_code: AWB,
          courier_company_id: 7,
          courier_name: 'Delhivery',
          current_status: 'In Transit',
        },
      ],
      shipment_track_activities: [
        {
          date: '2024-06-02T09:00:00Z',
          status: 'Pickup Scheduled',
          activity: 'Shipment pickup scheduled',
          location: 'Delhi',
          sr_status: 'pickup_scheduled',
        },
        {
          date: '2024-06-02T14:00:00Z',
          status: 'Delivered',
          activity: 'Shipment delivered',
          location: 'Mumbai',
          sr_status: 'delivered',
        },
      ],
    },
    ...overrides,
  }
}

// ─── transformTracking ────────────────────────────────────────────────────────

describe('shiprocket transformTracking', () => {
  it('takes shipmentId from shipment_track[0].shipment_id, not the argument', () => {
    const events = transformTracking(makeTrackingData(), AWB)
    // The argument is deliberately not the same as shipment_id so a
    // regression that reads it back off the argument is caught.
    expect(events[0].shipmentId).toBe('5001')
    expect(events[0].shipmentId).not.toBe(AWB)
  })

  it('does not fall back to shipment_track[0].id for shipmentId', () => {
    const events = transformTracking(makeTrackingData(), AWB)
    expect(events[0].shipmentId).not.toBe('9001')
  })

  it('uses trackingNumber from shipment_track[0].awb_code, falling back to the argument', () => {
    const events = transformTracking(makeTrackingData(), AWB)
    expect(events[0].trackingNumber).toBe(AWB)
  })

  it('falls back to the argument tracking number when awb_code is absent', () => {
    const raw = makeTrackingData()
    raw.tracking_data.shipment_track = [
      { id: 9001, shipment_id: 5001, awb_code: null, courier_company_id: 7, courier_name: 'Delhivery', current_status: 'In Transit' },
    ]
    expect(transformTracking(raw, AWB)[0].trackingNumber).toBe(AWB)
  })

  it('produces one TrackingEvent per shipment_track_activities[] entry', () => {
    expect(transformTracking(makeTrackingData(), AWB)).toHaveLength(2)
  })

  it('maps sr_status to canonical status', () => {
    const events = transformTracking(makeTrackingData(), AWB)
    expect(events[0].status).toBe('PRE_TRANSIT')
    expect(events[1].status).toBe('DELIVERED')
  })

  it('maps activity location as a city-only address', () => {
    const events = transformTracking(makeTrackingData(), AWB)
    expect(events[0].location?.city).toBe('Delhi')
  })

  it('returns [] when shipment_track_activities is null', () => {
    const raw = makeTrackingData()
    raw.tracking_data.shipment_track_activities = null
    expect(transformTracking(raw, AWB)).toHaveLength(0)
  })

  it('leaves shipmentId undefined when shipment_track is empty, rather than reusing the argument', () => {
    const raw = makeTrackingData()
    raw.tracking_data.shipment_track = []
    const events = transformTracking(raw, AWB)
    expect(events[0].shipmentId).toBeUndefined()
    expect(events[0].id).toBeUndefined()
  })

  it('produces output the canonical schema accepts', () => {
    for (const event of transformTracking(makeTrackingData(), AWB)) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})

// ─── ShiprocketAdapter#getTrackingEvents (request pin) ───────────────────────

describe('ShiprocketAdapter getTrackingEvents', () => {
  const credentials = { accessToken: 'TEST_token' } as Credentials
  const adapter = new ShiprocketAdapter()

  beforeEach(() => {
    getMock.mockReset()
  })

  it('requests courier/track/awb/{awb_code} — not courier/track/shipment/{shipment_id}', async () => {
    getMock.mockResolvedValueOnce(makeTrackingData())

    await adapter.getTrackingEvents(credentials, AWB)

    expect(getMock).toHaveBeenCalledTimes(1)
    expect(getMock).toHaveBeenCalledWith(`courier/track/awb/${AWB}`)
  })

  it('returns canonical events with the shipment id read from the response', async () => {
    getMock.mockResolvedValueOnce(makeTrackingData())

    const events = await adapter.getTrackingEvents(credentials, AWB)

    expect(events.length).toBeGreaterThan(0)
    expect(events[0].shipmentId).toBe('5001')
    for (const e of events) expect(() => TrackingEventSchema.parse(e)).not.toThrow()
  })
})
