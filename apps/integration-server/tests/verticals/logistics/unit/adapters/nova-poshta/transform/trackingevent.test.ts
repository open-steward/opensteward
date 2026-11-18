import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  type NovaPoshtaTrackingEventResponse,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/trackingevent'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

// transformTrackingEvent is re-exported from tracking.ts as transformTrackingResponse
// It returns TrackingEvent[] — the same contract as transformTrackingResponse.

function makeResponse(
  overrides: Partial<NovaPoshtaTrackingEventResponse> = {},
): NovaPoshtaTrackingEventResponse {
  return {
    id: 'ship-002',
    number: 'TTN-20240302-002',
    currentStatus: [
      {
        number: 'TTN-20240302-002',
        status: 'Delivered',
        statusDate: '2024-03-04T14:00:00Z',
        createdDate: '2024-03-01T00:00:00Z',
      },
    ],
    detailsTracking: [
      {
        number: 'TTN-20240302-002',
        date: '2024-03-04T14:00:00Z',
        eventStatus: 'Delivered',
        eventName: 'Parcel delivered',
        settlementName: 'Odessa',
        countryCode: 'UA',
      },
    ],
    ...overrides,
  }
}

describe('nova-poshta transformTrackingEvent (re-export from tracking)', () => {
  it('returns an array', () => {
    expect(Array.isArray(transformTrackingEvent(makeResponse()))).toBe(true)
  })

  it('maps status "Delivered" → DELIVERED', () => {
    const [evt] = transformTrackingEvent(makeResponse())
    expect(evt.status).toBe('DELIVERED')
  })

  it('maps carrierId as "nova-poshta"', () => {
    const [evt] = transformTrackingEvent(makeResponse())
    expect(evt.carrierId).toBe('nova-poshta')
  })

  it('maps trackingNumber from entry.number', () => {
    const [evt] = transformTrackingEvent(makeResponse())
    expect(evt.trackingNumber).toBe('TTN-20240302-002')
  })

  it('maps description from eventName', () => {
    const [evt] = transformTrackingEvent(makeResponse())
    expect(evt.description).toBe('Parcel delivered')
  })

  it('every event passes TrackingEventSchema.parse without throwing', () => {
    for (const event of transformTrackingEvent(makeResponse())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
