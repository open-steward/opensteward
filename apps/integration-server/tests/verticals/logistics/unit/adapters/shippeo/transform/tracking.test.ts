import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  type ShippeoTrackingResponse,
  type ShippeoMilestone,
} from '../../../../../../../src/verticals/logistics/adapters/shippeo/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeMilestone(overrides: Partial<ShippeoMilestone> = {}): ShippeoMilestone {
  return {
    id: 'milestone-001',
    event_code: 'IN_TRANSIT',
    status: 'IN_TRANSIT',
    description: 'Shipment is in transit',
    occurred_at: '2024-03-01T00:00:00Z',
    location: {
      city: 'Paris',
      state: null,
      postal_code: '75001',
      country: 'FR',
    },
    ...overrides,
  }
}

function makeRaw(overrides: Partial<ShippeoTrackingResponse> = {}): ShippeoTrackingResponse {
  return {
    shipment_id: 'shp-001',
    tracking_number: 'TRK-001',
    carrier_code: 'DHL',
    status: 'IN_TRANSIT',
    milestones: [makeMilestone()],
    ...overrides,
  }
}

describe('transformTrackingEvents', () => {
  it('produces one event per milestone', () => {
    const result = transformTrackingEvents(makeRaw())
    expect(result).toHaveLength(1)
  })

  it('maps trackingNumber from tracking_number', () => {
    expect(transformTrackingEvents(makeRaw())[0].trackingNumber).toBe('TRK-001')
  })

  it('falls back to shipment_id for trackingNumber', () => {
    expect(transformTrackingEvents(makeRaw({ tracking_number: null }))[0].trackingNumber).toBe(
      'shp-001',
    )
  })

  it('maps shipmentId', () => {
    expect(transformTrackingEvents(makeRaw())[0].shipmentId).toBe('shp-001')
  })

  it('maps carrierId from carrier_code', () => {
    expect(transformTrackingEvents(makeRaw())[0].carrierId).toBe('DHL')
  })

  it('defaults carrierId to shippeo when carrier_code absent', () => {
    expect(transformTrackingEvents(makeRaw({ carrier_code: null }))[0].carrierId).toBe('shippeo')
  })

  it('maps IN_TRANSIT status from event_code', () => {
    expect(transformTrackingEvents(makeRaw())[0].status).toBe('IN_TRANSIT')
  })

  it('maps DELIVERED status', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ event_code: 'DELIVERED' })],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps PRE_TRANSIT from CREATED event_code', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ event_code: 'CREATED' })],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps FAILURE from EXCEPTION event_code', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ event_code: 'EXCEPTION' })],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps AVAILABLE_FOR_PICKUP from HELD_AT_FACILITY event_code', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ event_code: 'HELD_AT_FACILITY' })],
    })
    expect(transformTrackingEvents(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps description from milestone description', () => {
    expect(transformTrackingEvents(makeRaw())[0].description).toBe('Shipment is in transit')
  })

  it('maps location.city from milestone location', () => {
    expect(transformTrackingEvents(makeRaw())[0].location?.city).toBe('Paris')
  })

  it('maps occurredAt from occurred_at', () => {
    expect(transformTrackingEvents(makeRaw())[0].occurredAt).toEqual(
      new Date('2024-03-01T00:00:00Z'),
    )
  })

  it('synthesises a single summary event when milestones is empty', () => {
    const raw = makeRaw({ milestones: [], status: 'DELIVERED' })
    const result = transformTrackingEvents(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('DELIVERED')
    expect(result[0].trackingNumber).toBe('TRK-001')
  })

  it('returns undefined location when milestone has no location', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ location: null })],
    })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('falls back to estimated_at when occurred_at absent', () => {
    const raw = makeRaw({
      milestones: [makeMilestone({ occurred_at: null, estimated_at: '2024-03-05T00:00:00Z' })],
    })
    expect(transformTrackingEvents(raw)[0].occurredAt).toEqual(new Date('2024-03-05T00:00:00Z'))
  })

  it('passes schema validation for each event', () => {
    const events = transformTrackingEvents(makeRaw())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
