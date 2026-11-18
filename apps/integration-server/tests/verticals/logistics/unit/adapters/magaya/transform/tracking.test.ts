import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type MagayaShipmentTracking,
  type MagayaTrackingEvent,
} from '../../../../../../../src/verticals/logistics/adapters/magaya/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeEvent(overrides: Partial<MagayaTrackingEvent> = {}): MagayaTrackingEvent {
  return {
    Status: 'In Transit',
    Description: 'Package is in transit',
    EventDate: '2024-03-01T00:00:00Z',
    City: 'Miami',
    State: 'FL',
    Country: 'US',
    PostalCode: '33101',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<MagayaShipmentTracking> = {}): MagayaShipmentTracking {
  return {
    ShipmentID: 'SHP-001',
    TrackingNumber: 'TRK-001',
    HouseAirwayBill: 'HAWB-001',
    MasterBill: 'MB-001',
    Events: [makeEvent()],
    ...overrides,
  }
}

describe('magaya transformTracking — with events', () => {
  it('returns one event per Events entry', () => {
    const raw = makeRaw({ Events: [makeEvent(), makeEvent({ Status: 'Delivered' })] })
    expect(transformTracking(raw)).toHaveLength(2)
  })

  it('maps carrierId to magaya', () => {
    expect(transformTracking(makeRaw())[0].carrierId).toBe('magaya')
  })

  it('maps shipmentId from ShipmentID', () => {
    expect(transformTracking(makeRaw({ ShipmentID: 'SHP-001' }))[0].shipmentId).toBe('SHP-001')
  })

  it('prefers TrackingNumber over HouseAirwayBill as trackingNumber', () => {
    expect(transformTracking(makeRaw({ TrackingNumber: 'TRK-001' }))[0].trackingNumber).toBe(
      'TRK-001',
    )
  })

  it('falls back to HouseAirwayBill when TrackingNumber is null', () => {
    const raw = makeRaw({ TrackingNumber: null, HouseAirwayBill: 'HAWB-001' })
    expect(transformTracking(raw)[0].trackingNumber).toBe('HAWB-001')
  })

  it('falls back to MasterBill when both TrackingNumber and HAWB are null', () => {
    const raw = makeRaw({ TrackingNumber: null, HouseAirwayBill: null, MasterBill: 'MB-001' })
    expect(transformTracking(raw)[0].trackingNumber).toBe('MB-001')
  })

  it('maps status "In Transit" → IN_TRANSIT via TRACKING_STATUS_MAP', () => {
    expect(transformTracking(makeRaw())[0].status).toBe('IN_TRANSIT')
  })

  it('maps status "Delivered" → DELIVERED', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Delivered' })] })
    expect(transformTracking(raw)[0].status).toBe('DELIVERED')
  })

  it('maps status "Draft" → PRE_TRANSIT', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Draft' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status "Pending" → PRE_TRANSIT', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Pending' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status "Confirmed" → PRE_TRANSIT', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Confirmed' })] })
    expect(transformTracking(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps status "Arrived at Destination" → IN_TRANSIT', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Arrived at Destination' })] })
    expect(transformTracking(raw)[0].status).toBe('IN_TRANSIT')
  })

  it('maps status "Cancelled" → FAILURE', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Cancelled' })] })
    expect(transformTracking(raw)[0].status).toBe('FAILURE')
  })

  it('maps status "Returned" → RETURN_TO_SENDER', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'Returned' })] })
    expect(transformTracking(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps unknown status → UNKNOWN', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: 'MYSTERY_STATUS' })] })
    expect(transformTracking(raw)[0].status).toBe('UNKNOWN')
  })

  it('null status → UNKNOWN', () => {
    const raw = makeRaw({ Events: [makeEvent({ Status: null })] })
    expect(transformTracking(raw)[0].status).toBe('UNKNOWN')
  })

  it('maps description from evt.Description', () => {
    const raw = makeRaw({ Events: [makeEvent({ Description: 'Cleared customs' })] })
    expect(transformTracking(raw)[0].description).toBe('Cleared customs')
  })

  it('maps location city/state/country/postalCode', () => {
    const loc = transformTracking(makeRaw())[0].location
    expect(loc?.city).toBe('Miami')
    expect(loc?.state).toBe('FL')
    expect(loc?.country).toBe('US')
    expect(loc?.postalCode).toBe('33101')
  })

  it('location is undefined when all location fields are absent', () => {
    const raw = makeRaw({
      Events: [
        makeEvent({ City: undefined, State: undefined, Country: undefined, PostalCode: undefined }),
      ],
    })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('parses occurredAt from EventDate as Date', () => {
    expect(transformTracking(makeRaw())[0].occurredAt).toBeInstanceOf(Date)
  })

  it('metadata is the event object (not the raw shipment)', () => {
    const evt = makeEvent()
    const raw = makeRaw({ Events: [evt] })
    expect(transformTracking(raw)[0].metadata).toBe(evt)
  })

  it('each event passes TrackingEventSchema validation', () => {
    const raw = makeRaw({ Events: [makeEvent()] })
    transformTracking(raw).forEach((e) => {
      expect(() => TrackingEventSchema.parse(e)).not.toThrow()
    })
  })
})

describe('magaya transformTracking — empty events fallback', () => {
  it('returns a single UNKNOWN event when Events is empty', () => {
    const raw = makeRaw({ Events: [] })
    const result = transformTracking(raw)
    expect(result).toHaveLength(1)
    expect(result[0].status).toBe('UNKNOWN')
  })

  it('fallback event metadata is the raw shipment object', () => {
    const raw = makeRaw({ Events: [] })
    expect(transformTracking(raw)[0].metadata).toBe(raw)
  })

  it('fallback event carrierId is magaya', () => {
    expect(transformTracking(makeRaw({ Events: [] }))[0].carrierId).toBe('magaya')
  })

  it('fallback event passes TrackingEventSchema validation', () => {
    const raw = makeRaw({ Events: [] })
    expect(() => TrackingEventSchema.parse(transformTracking(raw)[0])).not.toThrow()
  })
})
