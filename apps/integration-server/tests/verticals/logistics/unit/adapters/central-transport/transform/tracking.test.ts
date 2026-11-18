import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type PiyoviTrackingResponse,
  type PiyoviTrackingActivity,
} from '../../../../../../../src/verticals/logistics/adapters/central-transport/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeActivity(overrides: Partial<PiyoviTrackingActivity> = {}): PiyoviTrackingActivity {
  return {
    activityDateTime: '2024-03-01T00:00:00Z',
    description: 'Shipment picked up',
    status: 'Picked Up',
    city: 'Detroit',
    state: 'MI',
    postalCode: '48201',
    country: 'US',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<PiyoviTrackingResponse> = {}): PiyoviTrackingResponse {
  return {
    data: {
      trackingNumber: 'PRO-001',
      status: 'In Transit',
      statusDescription: 'Shipment in transit',
      activities: [makeActivity()],
    },
    ...overrides,
  }
}

describe('central-transport transformTrackingEvents', () => {
  it('returns one event per activity', () => {
    const result = transformTrackingEvents(makeRaw(), 'PRO-001')
    expect(result).toHaveLength(1)
  })

  it('maps carrierId to central-transport', () => {
    const result = transformTrackingEvents(makeRaw(), 'PRO-001')
    result.forEach((e) => expect(e.carrierId).toBe('central-transport'))
  })

  it('maps trackingNumber from nested record', () => {
    const result = transformTrackingEvents(makeRaw(), 'PRO-001')
    expect(result[0].trackingNumber).toBe('PRO-001')
  })

  it('maps "Picked Up" status to PRE_TRANSIT via TRACKING_STATUS_MAP', () => {
    const result = transformTrackingEvents(makeRaw(), 'PRO-001')
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps "In Transit" status to IN_TRANSIT', () => {
    const result = transformTrackingEvents(
      makeRaw({
        data: { trackingNumber: 'PRO-001', activities: [makeActivity({ status: 'In Transit' })] },
      }),
      'PRO-001',
    )
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('maps "Out for Delivery" status to OUT_FOR_DELIVERY', () => {
    const result = transformTrackingEvents(
      makeRaw({
        data: {
          trackingNumber: 'PRO-001',
          activities: [makeActivity({ status: 'Out for Delivery' })],
        },
      }),
      'PRO-001',
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps "Delivered" status to DELIVERED', () => {
    const result = transformTrackingEvents(
      makeRaw({
        data: { trackingNumber: 'PRO-001', activities: [makeActivity({ status: 'Delivered' })] },
      }),
      'PRO-001',
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps activity description to description', () => {
    expect(transformTrackingEvents(makeRaw(), 'PRO-001')[0].description).toBe('Shipment picked up')
  })

  it('maps city/state/postalCode to location', () => {
    const loc = transformTrackingEvents(makeRaw(), 'PRO-001')[0].location
    expect(loc?.city).toBe('Detroit')
    expect(loc?.state).toBe('MI')
    expect(loc?.postalCode).toBe('48201')
  })

  it('maps activityDateTime to occurredAt as Date', () => {
    expect(transformTrackingEvents(makeRaw(), 'PRO-001')[0].occurredAt).toBeInstanceOf(Date)
  })

  it('synthesises fallback event when activities empty', () => {
    const result = transformTrackingEvents(
      makeRaw({ data: { trackingNumber: 'PRO-001', status: 'In Transit', activities: [] } }),
      'PRO-001',
    )
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('IN_TRANSIT')
    expect(result[0].trackingNumber).toBe('PRO-001')
  })

  it('handles top-level fields without nested data wrapper', () => {
    const raw: PiyoviTrackingResponse = {
      trackingNumber: 'PRO-002',
      status: 'Delivered',
      activities: [makeActivity({ status: 'Delivered', city: 'Chicago', state: 'IL' })],
    }
    const result = transformTrackingEvents(raw, 'PRO-002')
    expect(result[0].status).toBe('DELIVERED')
    expect(result[0].trackingNumber).toBe('PRO-002')
  })

  it('handles array of records in data field', () => {
    const raw: PiyoviTrackingResponse = {
      data: [
        { trackingNumber: 'PRO-001', activities: [makeActivity()] },
        { trackingNumber: 'PRO-002', activities: [makeActivity({ status: 'Delivered' })] },
      ],
    }
    // normaliseRecord picks first element
    const result = transformTrackingEvents(raw, 'PRO-001')
    expect(result[0].trackingNumber).toBe('PRO-001')
  })

  it('all events satisfy TrackingEventSchema', () => {
    const result = transformTrackingEvents(makeRaw(), 'PRO-001')
    result.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})
