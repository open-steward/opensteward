import { describe, it, expect } from 'vitest'
import {
  transformTracker,
  type GigTracker,
  type GigTrackingDetail,
} from '../../../../../../../src/verticals/logistics/adapters/gig-logistics/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDetail(overrides: Partial<GigTrackingDetail> = {}): GigTrackingDetail {
  return {
    status: 'InTransit',
    description: 'Package in transit',
    city: 'Lagos',
    state: 'LA',
    country: 'NG',
    eventDate: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeTracker(overrides: Partial<GigTracker> = {}): GigTracker {
  return {
    waybillNumber: 'WB123456',
    shipmentId: 'gig-shp-001',
    currentStatus: 'InTransit',
    carrier: 'gig-logistics',
    trackingDetails: [makeDetail()],
    createdAt: '2024-03-01T00:00:00Z',
    updatedAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

describe('gig-logistics transformTracker', () => {
  it('returns one event per trackingDetails entry', () => {
    const raw = makeTracker({
      trackingDetails: [makeDetail(), makeDetail({ status: 'Delivered' })],
    })
    expect(transformTracker(raw)).toHaveLength(2)
  })

  it('maps waybillNumber as trackingNumber', () => {
    expect(transformTracker(makeTracker())[0].trackingNumber).toBe('WB123456')
  })

  it('maps shipmentId', () => {
    expect(transformTracker(makeTracker())[0].shipmentId).toBe('gig-shp-001')
  })

  it('maps carrier from raw carrier field', () => {
    expect(transformTracker(makeTracker())[0].carrierId).toBe('gig-logistics')
  })

  it('falls back carrierId to "gig-logistics" when carrier is null', () => {
    expect(transformTracker(makeTracker({ carrier: null }))[0].carrierId).toBe('gig-logistics')
  })

  it('maps InTransit detail status → IN_TRANSIT', () => {
    expect(transformTracker(makeTracker())[0].status).toBe('IN_TRANSIT')
  })

  it('maps Delivered detail status → DELIVERED', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'Delivered' })] }),
    )
    expect(result[0].status).toBe('DELIVERED')
  })

  it('maps OutForDelivery detail status → OUT_FOR_DELIVERY', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'OutForDelivery' })] }),
    )
    expect(result[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps pending detail status → PRE_TRANSIT', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'pending' })] }),
    )
    expect(result[0].status).toBe('PRE_TRANSIT')
  })

  it('maps AvailableForPickup → AVAILABLE_FOR_PICKUP', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'AvailableForPickup' })] }),
    )
    expect(result[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps Returned → RETURN_TO_SENDER', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'Returned' })] }),
    )
    expect(result[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps FailedDelivery → FAILURE', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ status: 'FailedDelivery' })] }),
    )
    expect(result[0].status).toBe('FAILURE')
  })

  it('maps description from detail', () => {
    expect(transformTracker(makeTracker())[0].description).toBe('Package in transit')
  })

  it('maps location city, state, country from detail', () => {
    const result = transformTracker(makeTracker())
    expect(result[0].location?.city).toBe('Lagos')
    expect(result[0].location?.state).toBe('LA')
    expect(result[0].location?.country).toBe('NG')
  })

  it('maps occurredAt from eventDate as Date', () => {
    expect(transformTracker(makeTracker())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('emits a synthetic summary event when trackingDetails is empty', () => {
    const result = transformTracker(makeTracker({ trackingDetails: [] }))
    expect(result).toHaveLength(1)
    expect(result[0].trackingNumber).toBe('WB123456')
    expect(result[0].status).toBe('IN_TRANSIT')
  })

  it('emits a synthetic summary event when trackingDetails is null', () => {
    const result = transformTracker(makeTracker({ trackingDetails: null }))
    expect(result).toHaveLength(1)
  })

  it('uses location field as city when city is absent', () => {
    const result = transformTracker(
      makeTracker({ trackingDetails: [makeDetail({ city: undefined, location: 'Kano Hub' })] }),
    )
    expect(result[0].location?.city).toBe('Kano Hub')
  })

  it('passes TrackingEventSchema validation', () => {
    expect(() => TrackingEventSchema.parse(transformTracker(makeTracker())[0])).not.toThrow()
  })
})
