import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ShipKaroTrackingData,
  type ShipKaroTrackingActivity,
} from '../../../../../../../src/verticals/logistics/adapters/shipkaro/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeActivity(overrides: Partial<ShipKaroTrackingActivity> = {}): ShipKaroTrackingActivity {
  return {
    date: '2024-03-01T00:00:00Z',
    status: 'in_transit',
    activity: 'Package in transit',
    location: 'Mumbai Hub',
    sr_status: 'in_transit',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<ShipKaroTrackingData> = {}): ShipKaroTrackingData {
  return {
    tracking_data: {
      track_status: 1,
      shipment_status: 3,
      shipment_track: [
        {
          id: 500,
          awb_code: 'AWB-001',
          courier_name: 'BlueDart',
          current_status: 'in_transit',
        },
      ],
      shipment_track_activities: [makeActivity()],
    },
    ...overrides,
  }
}

describe('transformTracking', () => {
  it('produces one event per activity', () => {
    const result = transformTracking(makeRaw(), 'shp-001')
    expect(result).toHaveLength(1)
  })

  it('maps shipmentId from parameter', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].shipmentId).toBe('shp-001')
  })

  it('maps trackingNumber from nested shipment_track.awb_code', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].trackingNumber).toBe('AWB-001')
  })

  it('maps carrierId from nested shipment_track.courier_name', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].carrierId).toBe('BlueDart')
  })

  it('maps IN_TRANSIT status from sr_status', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status', () => {
    const raw = makeRaw({
      tracking_data: {
        ...makeRaw().tracking_data,
        shipment_track_activities: [makeActivity({ sr_status: 'delivered' })],
      },
    })
    expect(transformTracking(raw, 'shp-001')[0].status).toBe('DELIVERED')
  })

  it('maps RETURN_TO_SENDER for rto', () => {
    const raw = makeRaw({
      tracking_data: {
        ...makeRaw().tracking_data,
        shipment_track_activities: [makeActivity({ sr_status: 'rto' })],
      },
    })
    expect(transformTracking(raw, 'shp-001')[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps description from activity field', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].description).toBe('Package in transit')
  })

  it('maps location.city from activity location string', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].location?.city).toBe('Mumbai Hub')
  })

  it('maps occurredAt from date field', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].occurredAt).toEqual(
      new Date('2024-03-01T00:00:00Z'),
    )
  })

  it('sets id with shipmentId prefix and index', () => {
    expect(transformTracking(makeRaw(), 'shp-001')[0].id).toBe('shp-001-0')
  })

  it('handles flat activities shape (root-level)', () => {
    const raw: ShipKaroTrackingData = {
      activities: [makeActivity()],
      awb_code: 'AWB-FLAT',
      courier_name: 'DTDC',
    }
    const result = transformTracking(raw, 'shp-002')
    expect(result).toHaveLength(1)
    expect(result[0].carrierId).toBe('DTDC')
  })

  it('passes schema validation for each event', () => {
    const events = transformTracking(makeRaw(), 'shp-001')
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
