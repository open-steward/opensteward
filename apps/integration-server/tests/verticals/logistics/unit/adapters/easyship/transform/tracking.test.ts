import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type EasyshipTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/easyship/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeResponse(overrides: Partial<EasyshipTrackingResponse> = {}): EasyshipTrackingResponse {
  return {
    shipments: [
      {
        easyship_shipment_id: 'ESP-1',
        checkpoints: [
          {
            checkpoint_time: '2024-05-10T10:30:00Z',
            message: 'Departed facility',
            primary_status: 'in_transit',
            city: 'Paris',
            state: 'IDF',
            postal_code: '75001',
            country_iso3: 'FRA',
          },
          {
            checkpoint_time: '2024-05-09T08:00:00Z',
            message: 'Label created',
            primary_status: 'confirmed',
            city: null,
            state: null,
            postal_code: null,
            country_iso3: null,
          },
        ],
      },
    ],
    ...overrides,
  }
}

describe('Easyship transformTracking', () => {
  it('maps each checkpoint to a tracking event, keyed by the Easyship shipment id', () => {
    const events = transformTracking(makeResponse())
    expect(events).toHaveLength(2)
    expect(events[0].shipmentId).toBe('ESP-1')
    expect(events[0].carrierId).toBe('easyship')
    expect(events[0].description).toBe('Departed facility')
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('normalises country_iso3 (alpha-3) to the canonical alpha-2 country code', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].location?.city).toBe('Paris')
    expect(events[0].location?.postalCode).toBe('75001')
    expect(events[0].location?.country).toBe('FR')
  })

  it('omits location when the checkpoint carries none', () => {
    const events = transformTracking(makeResponse())
    expect(events[1].location).toBeUndefined()
  })

  it('returns [] when no shipment matches the query', () => {
    expect(transformTracking(makeResponse({ shipments: [] }))).toEqual([])
    expect(transformTracking({})).toEqual([])
  })

  it('returns [] when the matching shipment has no checkpoints yet', () => {
    expect(
      transformTracking(makeResponse({ shipments: [{ easyship_shipment_id: 'ESP-1' }] })),
    ).toEqual([])
  })

  it('maps primary_status keywords to canonical statuses, defaulting to UNKNOWN', () => {
    const cases: [string, string][] = [
      ['confirmed', 'PRE_TRANSIT'],
      ['label_created', 'PRE_TRANSIT'],
      ['picked_up', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['delivered', 'DELIVERED'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['exception', 'FAILURE'],
      ['returned_to_sender', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [primary_status, expected] of cases) {
      const events = transformTracking(
        makeResponse({
          shipments: [{ easyship_shipment_id: 'ESP-1', checkpoints: [{ primary_status }] }],
        }),
      )
      expect(events[0].status).toBe(expected)
    }
  })

  it('passes through each checkpoint as metadata', () => {
    const events = transformTracking(makeResponse())
    expect(events[0].metadata).toMatchObject({ primary_status: 'in_transit' })
  })

  it('round-trips every mapped event through TrackingEventSchema', () => {
    for (const event of transformTracking(makeResponse())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
