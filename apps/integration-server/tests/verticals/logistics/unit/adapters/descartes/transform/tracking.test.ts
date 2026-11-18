import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type DescartesTrackingResponse,
  type DescartesTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/descartes/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<DescartesTrackingEvent> = {}): DescartesTrackingEvent {
  return {
    eventCode: 'IN_TRANSIT',
    eventDescription: 'Package in transit',
    eventTimestamp: '2024-03-01T10:00:00Z',
    location: {
      city: 'Atlanta',
      state: 'GA',
      postalCode: '30301',
      country: 'US',
      facilityName: 'ATL Hub',
    },
    ...overrides,
  }
}

function makeResponse(
  overrides: Partial<DescartesTrackingResponse> = {},
): DescartesTrackingResponse {
  return {
    trackingNumber: 'DSC-TRK-001',
    shipmentId: 'shp-abc',
    currentStatus: 'IN_TRANSIT',
    currentStatusDescription: 'In transit',
    events: [makeEvent(), makeEvent({ eventCode: 'DELIVERED', eventDescription: 'Delivered' })],
    ...overrides,
  }
}

describe('descartes transformTrackingEvents', () => {
  it('returns one event per events entry', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result).toHaveLength(2)
  })

  it('maps trackingNumber from response', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].trackingNumber).toBe('DSC-TRK-001')
  })

  it('falls back to shipmentId as trackingNumber when trackingNumber absent', () => {
    const result = transformTrackingEvents(makeResponse({ trackingNumber: null }))
    expect(result[0].trackingNumber).toBe('shp-abc')
  })

  it('sets carrierId to descartes', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].carrierId).toBe('descartes')
  })

  it('maps IN_TRANSIT eventCode to IN_TRANSIT status', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED eventCode to DELIVERED status', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[1].status).toBe('DELIVERED')
  })

  it('maps BOOKED/CREATED/PICKUP_REQUESTED to PRE_TRANSIT', () => {
    for (const code of ['BOOKED', 'CREATED', 'PICKUP_REQUESTED', 'PICKUP_SCHEDULED']) {
      const result = transformTrackingEvents(
        makeResponse({ events: [makeEvent({ eventCode: code })] }),
      )
      expect(result[0].status).toBe('PRE_TRANSIT')
    }
  })

  it('maps ON_VEHICLE/OUT_FOR_DELIVERY to OUT_FOR_DELIVERY', () => {
    for (const code of ['ON_VEHICLE', 'OUT_FOR_DELIVERY']) {
      const result = transformTrackingEvents(
        makeResponse({ events: [makeEvent({ eventCode: code })] }),
      )
      expect(result[0].status).toBe('OUT_FOR_DELIVERY')
    }
  })

  it('maps EXCEPTION/FAILED to FAILURE', () => {
    for (const code of ['EXCEPTION', 'FAILED']) {
      const result = transformTrackingEvents(
        makeResponse({ events: [makeEvent({ eventCode: code })] }),
      )
      expect(result[0].status).toBe('FAILURE')
    }
  })

  it('maps RETURNED/RETURN_TO_SENDER to RETURN_TO_SENDER', () => {
    for (const code of ['RETURNED', 'RETURN_TO_SENDER']) {
      const result = transformTrackingEvents(
        makeResponse({ events: [makeEvent({ eventCode: code })] }),
      )
      expect(result[0].status).toBe('RETURN_TO_SENDER')
    }
  })

  it('maps AVAILABLE_FOR_PICKUP status', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'AVAILABLE_FOR_PICKUP' })] }),
    )
    expect(result[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps unknown eventCode to UNKNOWN', () => {
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'SOMETHING_NEW' })] }),
    )
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('maps eventDescription to description', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].description).toBe('Package in transit')
  })

  it('maps location fields', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].location?.city).toBe('Atlanta')
    expect(result[0].location?.state).toBe('GA')
    expect(result[0].location?.postalCode).toBe('30301')
    expect(result[0].location?.country).toBe('US')
    expect(result[0].location?.name).toBe('ATL Hub')
  })

  it('maps eventTimestamp to occurredAt', () => {
    const result = transformTrackingEvents(makeResponse())
    expect(result[0].occurredAt).toBeInstanceOf(Date)
    expect(result[0].occurredAt?.toISOString()).toBe('2024-03-01T10:00:00.000Z')
  })

  it('produces a fallback event when events is empty', () => {
    const result = transformTrackingEvents(makeResponse({ events: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].description).toBe('In transit')
  })

  it('produces a fallback event when events is absent', () => {
    const result = transformTrackingEvents(makeResponse({ events: undefined }))
    expect(result).toHaveLength(1)
  })

  it('normalises hyphenated event codes', () => {
    // Code with hyphen should be normalised to underscore before lookup
    const result = transformTrackingEvents(
      makeResponse({ events: [makeEvent({ eventCode: 'IN-TRANSIT' })] }),
    )
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('omits location when all location fields absent', () => {
    const result = transformTrackingEvents(
      makeResponse({
        events: [makeEvent({ location: null })],
      }),
    )
    expect(result[0].location).toBeUndefined()
  })

  it('passes schema validation for each event', () => {
    const result = transformTrackingEvents(makeResponse())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
