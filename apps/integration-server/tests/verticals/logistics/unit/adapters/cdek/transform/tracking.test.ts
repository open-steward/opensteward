import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type CdekTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/cdek/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRaw(overrides: Partial<CdekTrackingResponse> = {}): CdekTrackingResponse {
  return {
    uuid: 'uuid-001',
    cdek_number: 'CDEK-001',
    number: 'ORD-001',
    statuses: [
      {
        code: 'CREATED',
        name: 'Order registered',
        date_time: '2024-03-01T00:00:00Z',
        city: 'Moscow',
      },
      {
        code: 'IN_TRANSIT',
        name: 'In transit',
        date_time: '2024-03-02T00:00:00Z',
        city: 'Tver',
      },
    ],
    ...overrides,
  }
}

describe('cdek transformTrackingEvents', () => {
  it('returns one event per status entry', () => {
    const result = transformTrackingEvents(makeRaw())
    expect(result).toHaveLength(2)
  })

  it('maps cdek_number to trackingNumber', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(e.trackingNumber).toBe('CDEK-001'))
  })

  it('maps carrierId to cdek', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(e.carrierId).toBe('cdek'))
  })

  it('maps CREATED status code to PRE_TRANSIT', () => {
    expect(transformTrackingEvents(makeRaw())[0].status).toBe('PRE_TRANSIT')
  })

  it('maps IN_TRANSIT status code to IN_TRANSIT', () => {
    expect(transformTrackingEvents(makeRaw())[1].status).toBe('IN_TRANSIT')
  })

  it('maps status name to description', () => {
    expect(transformTrackingEvents(makeRaw())[0].description).toBe('Order registered')
  })

  it('maps city to location.city', () => {
    expect(transformTrackingEvents(makeRaw())[0].location?.city).toBe('Moscow')
  })

  it('maps date_time to occurredAt as Date', () => {
    expect(transformTrackingEvents(makeRaw())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('sets shipmentId from uuid', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(e.shipmentId).toBe('uuid-001'))
  })

  it('returns single UNKNOWN fallback event when statuses empty', () => {
    const result = transformTrackingEvents(makeRaw({ statuses: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('UNKNOWN')
    expect(result[0].trackingNumber).toBe('CDEK-001')
  })

  it('all events satisfy TrackingEventSchema', () => {
    const result = transformTrackingEvents(makeRaw())
    result.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })

  it('maps DELIVERED to DELIVERED', () => {
    const result = transformTrackingEvents(
      makeRaw({
        statuses: [
          { code: 'DELIVERED', name: 'Delivered', date_time: '2024-03-03T00:00:00Z', city: 'SPb' },
        ],
      }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps RETURNED_TO_SENDER to RETURN_TO_SENDER', () => {
    const result = transformTrackingEvents(
      makeRaw({
        statuses: [
          {
            code: 'RETURNED_TO_SENDER',
            name: 'Returned',
            date_time: '2024-03-04T00:00:00Z',
            city: null,
          },
        ],
      }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps NOT_DELIVERED to FAILURE', () => {
    const result = transformTrackingEvents(
      makeRaw({
        statuses: [
          {
            code: 'NOT_DELIVERED',
            name: 'Not delivered',
            date_time: '2024-03-04T00:00:00Z',
            city: null,
          },
        ],
      }),
    )
    expect(result[0].status).toBe('FAILURE')
  })
})
