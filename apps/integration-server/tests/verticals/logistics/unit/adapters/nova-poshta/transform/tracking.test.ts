import { describe, it, expect } from 'vitest'
import {
  transformTrackingResponse,
  type NovaPoshtaTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/nova-poshta/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeTrackingResponse(
  overrides: Partial<NovaPoshtaTrackingResponse> = {},
): NovaPoshtaTrackingResponse {
  return {
    id: 'ship-001',
    number: 'TTN-20240301-001',
    currentStatus: [
      {
        number: 'TTN-20240301-001',
        statusCode: 4,
        status: 'InTransit',
        statusDate: '2024-03-02T10:00:00Z',
        createdDate: '2024-03-01T00:00:00Z',
        deliveryType: 'standard',
        deliveryCountry: 'UA',
      },
    ],
    detailsTracking: [
      {
        number: 'TTN-20240301-001',
        date: '2024-03-01T08:00:00Z',
        event: 'InTransit',
        eventStatus: 'InTransit',
        eventName: 'Parcel in transit',
        countryCode: 'UA',
        settlementName: 'Kyiv',
        region: 'Kyiv Oblast',
      },
      {
        number: 'TTN-20240301-001',
        date: '2024-03-02T10:00:00Z',
        event: 'InTransit',
        eventStatus: 'SortingCenter',
        eventName: 'Arrived at sorting center',
        countryCode: 'UA',
        settlementName: 'Lviv',
        region: 'Lviv Oblast',
      },
    ],
    ...overrides,
  }
}

describe('nova-poshta transformTrackingResponse', () => {
  it('returns an array of tracking events equal to detailsTracking entries', () => {
    const result = transformTrackingResponse(makeTrackingResponse())
    expect(result).toHaveLength(2)
  })

  it('maps trackingNumber from entry.number', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.trackingNumber).toBe('TTN-20240301-001')
  })

  it('maps shipmentId from response.id', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.shipmentId).toBe('ship-001')
  })

  it('hardcodes carrierId as "nova-poshta"', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.carrierId).toBe('nova-poshta')
  })

  it('maps status "InTransit" → IN_TRANSIT from eventStatus', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.status).toBe('IN_TRANSIT')
  })

  it('maps status "SortingCenter" → IN_TRANSIT', () => {
    const [, second] = transformTrackingResponse(makeTrackingResponse())
    expect(second.status).toBe('IN_TRANSIT')
  })

  it('maps description from eventName', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.description).toBe('Parcel in transit')
  })

  it('maps location from settlementName', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.location?.city).toBe('Kyiv')
    expect(first.location?.state).toBe('Kyiv Oblast')
    expect(first.location?.country).toBe('UA')
  })

  it('maps occurredAt from entry.date', () => {
    const [first] = transformTrackingResponse(makeTrackingResponse())
    expect(first.occurredAt).toBeInstanceOf(Date)
  })

  it('falls back to historyOnlineTracking when detailsTracking is absent', () => {
    const result = transformTrackingResponse(
      makeTrackingResponse({
        detailsTracking: undefined,
        historyOnlineTracking: [
          {
            number: 'TTN-20240301-001',
            date: '2024-03-01T08:00:00Z',
            eventStatus: 'InTransit',
            eventName: 'History entry',
          },
        ],
      }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].description).toBe('History entry')
  })

  it('synthesises single event from currentStatus when no history present', () => {
    const result = transformTrackingResponse(
      makeTrackingResponse({
        detailsTracking: undefined,
        historyOnlineTracking: undefined,
      }),
    )
    expect(result).toHaveLength(1)
    expect(result[0].trackingNumber).toBe('TTN-20240301-001')
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('every event passes TrackingEventSchema.parse without throwing', () => {
    for (const event of transformTrackingResponse(makeTrackingResponse())) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
