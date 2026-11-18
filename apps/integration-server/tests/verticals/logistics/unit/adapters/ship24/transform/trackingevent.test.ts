import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type Ship24TrackingResult,
} from '../../../../../../../src/verticals/logistics/adapters/ship24/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// ─── transformTrackingEvent (re-export of transformTrackingEvents) ─────────────

describe('transformTrackingEvent', () => {
  it('is the re-exported transformTrackingEvents and returns an array', () => {
    const raw: Ship24TrackingResult = {
      tracker: {
        trackerId: 'trk-reexport',
        trackingNumber: 'TN-REEXPORT-001',
        shipmentReference: null,
        clientTrackerId: null,
        isSubscribed: false,
        isTracked: true,
        createdAt: '2024-03-01T00:00:00Z',
      },
      shipment: null,
      events: [
        {
          eventId: 'e1',
          trackingNumber: 'TN-REEXPORT-001',
          eventTrackingNumber: 'TN-REEXPORT-001',
          status: 'Delivered',
          occurrenceDatetime: '2024-03-08T12:00:00Z',
          order: 1,
          location: 'New York, US',
          sourceCode: 'USPS',
          courierCode: 'usps',
          statusCode: '300',
          statusCategory: 'delivered',
          statusMilestone: 'delivered',
        },
      ],
      statistics: null,
    }

    const events = transformTrackingEvent(raw)
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('TN-REEXPORT-001')
    expect(events[0].carrierId).toBe('usps')
    expect(events[0].status).toBe('DELIVERED')
  })

  it('each event passes TrackingEventSchema', () => {
    const raw: Ship24TrackingResult = {
      tracker: {
        trackerId: 'trk-schema',
        trackingNumber: 'TN-SCHEMA-001',
        shipmentReference: null,
        clientTrackerId: null,
        isSubscribed: true,
        isTracked: true,
        createdAt: '2024-03-01T00:00:00Z',
      },
      shipment: {
        shipmentId: 'shp-schema',
        statusCode: '100',
        statusCategory: 'pre_transit',
        statusMilestone: 'info_received',
        originCountryCode: 'GB',
        destinationCountryCode: 'US',
        delivery: null,
        trackingNumbers: null,
        recipient: null,
      },
      events: [
        {
          eventId: 'e-schema-1',
          trackingNumber: 'TN-SCHEMA-001',
          eventTrackingNumber: 'TN-SCHEMA-001',
          status: 'Label Created',
          occurrenceDatetime: '2024-03-01T10:00:00Z',
          order: 1,
          location: 'London, GB',
          sourceCode: 'ROYAL_MAIL',
          courierCode: 'royal-mail',
          statusCode: '100',
          statusCategory: 'pre_transit',
          statusMilestone: 'info_received',
        },
      ],
      statistics: null,
    }

    for (const event of transformTrackingEvent(raw)) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
