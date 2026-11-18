import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvents,
  transformShipment,
  type Ship24TrackingResult,
  type Ship24Event,
  type Ship24Shipment,
  type Ship24Tracker,
} from '../../../../../../../src/verticals/logistics/adapters/ship24/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTracker(overrides: Partial<Ship24Tracker> = {}): Ship24Tracker {
  return {
    trackerId: 'tracker-abc',
    trackingNumber: 'TN-SHIP24-001',
    shipmentReference: 'REF-001',
    clientTrackerId: null,
    isSubscribed: true,
    isTracked: true,
    createdAt: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipment24(overrides: Partial<Ship24Shipment> = {}): Ship24Shipment {
  return {
    shipmentId: 'shp-ship24-001',
    statusCode: '200',
    statusCategory: 'dhl',
    statusMilestone: 'in_transit',
    originCountryCode: 'CN',
    destinationCountryCode: 'US',
    delivery: {
      estimatedDeliveryDate: '2024-03-10T00:00:00Z',
      service: 'DHL Express',
      signedBy: null,
    },
    trackingNumbers: [{ tn: 'TN-SHIP24-001' }],
    recipient: {
      name: 'Jane Doe',
      address: '123 Main St',
      postCode: '94102',
      city: 'San Francisco',
      subdivision: 'CA',
    },
    ...overrides,
  }
}

function makeEvent(overrides: Partial<Ship24Event> = {}): Ship24Event {
  return {
    eventId: 'evt-001',
    trackingNumber: 'TN-SHIP24-001',
    eventTrackingNumber: 'TN-SHIP24-001',
    status: 'In Transit',
    occurrenceDatetime: '2024-03-05T08:00:00Z',
    order: 1,
    location: 'Shanghai, CN',
    sourceCode: 'DHL',
    courierCode: 'dhl',
    statusCode: '201',
    statusCategory: 'in_transit',
    statusMilestone: 'in_transit',
    ...overrides,
  }
}

function makeResult(overrides: Partial<Ship24TrackingResult> = {}): Ship24TrackingResult {
  return {
    tracker: makeTracker(),
    shipment: makeShipment24(),
    events: [makeEvent()],
    statistics: null,
    ...overrides,
  }
}

// ─── transformTrackingEvents ──────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('returns one event per Ship24Event', () => {
    const raw = makeResult({ events: [makeEvent(), makeEvent({ eventId: 'evt-002', order: 2 })] })
    expect(transformTrackingEvents(raw)).toHaveLength(2)
  })

  it('maps trackingNumber and carrierId from event', () => {
    const event = transformTrackingEvents(makeResult())[0]
    expect(event.trackingNumber).toBe('TN-SHIP24-001')
    expect(event.carrierId).toBe('dhl')
  })

  it('maps statusMilestone in_transit → IN_TRANSIT', () => {
    const event = transformTrackingEvents(makeResult())[0]
    expect(event.status).toBe('IN_TRANSIT')
  })

  it('maps all statusMilestone values', () => {
    const cases: [string, string][] = [
      ['info_received', 'PRE_TRANSIT'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['failed_attempt', 'FAILURE'],
      ['available_for_pickup', 'AVAILABLE_FOR_PICKUP'],
      ['exception', 'FAILURE'],
      ['delivered', 'DELIVERED'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [milestone, expected] of cases) {
      const result = makeResult({ events: [makeEvent({ statusMilestone: milestone })] })
      expect(transformTrackingEvents(result)[0].status).toBe(expected)
    }
  })

  it('maps status string → description', () => {
    const event = transformTrackingEvents(makeResult())[0]
    expect(event.description).toBe('In Transit')
  })

  it('parses location "City, State, Country" into address parts', () => {
    const raw = makeResult({ events: [makeEvent({ location: 'Los Angeles, CA, US' })] })
    const event = transformTrackingEvents(raw)[0]
    expect(event.location?.city).toBe('Los Angeles')
    expect(event.location?.state).toBe('CA')
    expect(event.location?.country).toBe('US')
  })

  it('parses location "City, Country" into two parts', () => {
    const raw = makeResult({ events: [makeEvent({ location: 'Shanghai, CN' })] })
    const event = transformTrackingEvents(raw)[0]
    expect(event.location?.city).toBe('Shanghai')
    expect(event.location?.country).toBe('CN')
  })

  it('parses location single word as city', () => {
    const raw = makeResult({ events: [makeEvent({ location: 'Frankfurt' })] })
    const event = transformTrackingEvents(raw)[0]
    expect(event.location?.city).toBe('Frankfurt')
  })

  it('omits location when location is null', () => {
    const raw = makeResult({ events: [makeEvent({ location: null })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('parses occurrenceDatetime → occurredAt as Date', () => {
    const event = transformTrackingEvents(makeResult())[0]
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('returns a stub event when events array is empty', () => {
    const raw = makeResult({ events: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('TN-SHIP24-001')
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('each event passes TrackingEventSchema', () => {
    const events = transformTrackingEvents(makeResult())
    for (const event of events) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})

// ─── transformShipment ────────────────────────────────────────────────────────

describe('transformShipment (ship24)', () => {
  it('maps tracker.trackerId → id', () => {
    expect(transformShipment(makeResult()).id).toBe('tracker-abc')
  })

  it('maps statusMilestone in_transit → IN_TRANSIT shipment status', () => {
    expect(transformShipment(makeResult()).status).toBe('IN_TRANSIT')
  })

  it('maps all shipment status milestones', () => {
    const cases: [string, string][] = [
      ['info_received', 'LABEL_CREATED'],
      ['in_transit', 'IN_TRANSIT'],
      ['out_for_delivery', 'OUT_FOR_DELIVERY'],
      ['failed_attempt', 'EXCEPTION'],
      ['available_for_pickup', 'IN_TRANSIT'],
      ['exception', 'EXCEPTION'],
      ['delivered', 'DELIVERED'],
      ['bogus', 'UNKNOWN'],
    ]
    for (const [milestone, expected] of cases) {
      const raw = makeResult({ shipment: makeShipment24({ statusMilestone: milestone }) })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })

  it('maps trackingNumber from tracker', () => {
    expect(transformShipment(makeResult()).trackingNumber).toBe('TN-SHIP24-001')
  })

  it('maps service → serviceCode', () => {
    expect(transformShipment(makeResult()).serviceCode).toBe('DHL Express')
  })

  it('maps shipmentReference → reference', () => {
    expect(transformShipment(makeResult()).reference).toBe('REF-001')
  })

  it('maps recipient → destinationAddress', () => {
    const result = transformShipment(makeResult())
    expect(result.destinationAddress?.name).toBe('Jane Doe')
    expect(result.destinationAddress?.city).toBe('San Francisco')
    expect(result.destinationAddress?.state).toBe('CA')
    expect(result.destinationAddress?.postalCode).toBe('94102')
    expect(result.destinationAddress?.country).toBe('US')
  })

  it('maps originCountryCode → originAddress.country', () => {
    const result = transformShipment(makeResult())
    expect(result.originAddress?.country).toBe('CN')
  })

  it('parses estimatedDeliveryDate → estimatedDeliveryAt as Date', () => {
    expect(transformShipment(makeResult()).estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('parses createdAt as Date', () => {
    expect(transformShipment(makeResult()).createdAt).toBeInstanceOf(Date)
  })

  it('handles null shipment gracefully', () => {
    const raw = makeResult({ shipment: null })
    const result = transformShipment(raw)
    expect(result.status).toBe('UNKNOWN')
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('passes schema validation', () => {
    expect(() => ShipmentSchema.parse(transformShipment(makeResult()))).not.toThrow()
  })

  it('passes metadata as raw result reference', () => {
    const raw = makeResult()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
