import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  transformShipment,
  mapTrackingStatus,
  mapShipmentStatus,
  type PortcastContainer,
  type PortcastContainerEvent,
} from '../../../../../../../src/verticals/logistics/adapters/portcast/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'
import { ShipmentSchema } from '../../../../../../../src/verticals/logistics/schema/shipment'

function makeEvent(overrides: Partial<PortcastContainerEvent> = {}): PortcastContainerEvent {
  return {
    event_type: 'VESSEL_DEPARTURE',
    description: 'Vessel departed port',
    actual_time: '2024-03-01T00:00:00Z',
    location: { city: 'Shanghai', country: 'CN', UNLocationCode: 'CNSHA' },
    ...overrides,
  }
}

function makeContainer(overrides: Partial<PortcastContainer> = {}): PortcastContainer {
  return {
    id: 'ctr-001',
    container_number: 'MSCU1234567',
    container_type: '40HC',
    booking_number: 'BK-2024-001',
    bill_of_lading_number: 'BL-2024-001',
    carrier_no: 'MSC',
    carrier_name: 'Mediterranean Shipping Company',
    status: 'IN_TRANSIT',
    pol: { UNLocationCode: 'CNSHA', city: 'Shanghai', country: 'CN' },
    pod: { UNLocationCode: 'USLAX', city: 'Los Angeles', country: 'US' },
    vessel: { name: 'MV Acme Star', voyage_number: 'V042E', imo: '9999999' },
    voyage_number: 'V042E',
    estimated_arrival: '2024-03-01T00:00:00Z',
    actual_arrival: null,
    estimated_departure: '2024-01-15T00:00:00Z',
    actual_departure: '2024-01-15T00:00:00Z',
    events: [makeEvent()],
    created_at: '2024-01-01T00:00:00Z',
    updated_at: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

// ─── mapTrackingStatus ────────────────────────────────────────────────────────

describe('mapTrackingStatus', () => {
  it('returns IN_TRANSIT for VESSEL_DEPARTURE', () => {
    expect(mapTrackingStatus('VESSEL_DEPARTURE')).toBe('IN_TRANSIT')
  })

  it('returns DELIVERED for DELIVER event', () => {
    expect(mapTrackingStatus('DELIVER')).toBe('DELIVERED')
  })

  it('returns PRE_TRANSIT for GATE_OUT', () => {
    expect(mapTrackingStatus('GATE_OUT')).toBe('PRE_TRANSIT')
  })

  it('returns UNKNOWN for null/undefined', () => {
    expect(mapTrackingStatus(null)).toBe('UNKNOWN')
    expect(mapTrackingStatus(undefined)).toBe('UNKNOWN')
  })

  it('returns FAILURE for EXCEPTION event', () => {
    expect(mapTrackingStatus('EXCEPTION')).toBe('FAILURE')
  })
})

// ─── mapShipmentStatus ────────────────────────────────────────────────────────

describe('mapShipmentStatus', () => {
  it('maps DELIVERED', () => expect(mapShipmentStatus('DELIVERED')).toBe('DELIVERED'))
  it('maps IN_TRANSIT', () => expect(mapShipmentStatus('IN_TRANSIT')).toBe('IN_TRANSIT'))
  it('maps CANCEL prefix', () => expect(mapShipmentStatus('CANCELLED')).toBe('CANCELLED'))
  it('maps EXCEPTION', () => expect(mapShipmentStatus('EXCEPTION')).toBe('EXCEPTION'))
  it('maps PENDING→LABEL_CREATED', () => expect(mapShipmentStatus('PENDING')).toBe('LABEL_CREATED'))
  it('returns UNKNOWN for null', () => expect(mapShipmentStatus(null)).toBe('UNKNOWN'))
})

// ─── transformTracking ────────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per events entry', () => {
    const container = makeContainer({
      events: [makeEvent(), makeEvent({ event_type: 'VESSEL_ARRIVAL' })],
    })
    expect(transformTracking(container)).toHaveLength(2)
  })

  it('emits a single fallback event when events is empty', () => {
    const container = makeContainer({ events: [] })
    const events = transformTracking(container)
    expect(events).toHaveLength(1)
    expect(events[0].trackingNumber).toBe('MSCU1234567')
  })

  it('maps container_number to trackingNumber', () => {
    const events = transformTracking(makeContainer())
    expect(events[0].trackingNumber).toBe('MSCU1234567')
  })

  it('maps carrier_no to carrierId', () => {
    const events = transformTracking(makeContainer())
    expect(events[0].carrierId).toBe('MSC')
  })

  it('maps location fields correctly', () => {
    const events = transformTracking(makeContainer())
    expect(events[0].location?.city).toBe('Shanghai')
    expect(events[0].location?.country).toBe('CN')
    expect(events[0].location?.postalCode).toBe('CNSHA')
  })

  it('uses estimated_time when actual_time is absent', () => {
    const container = makeContainer({
      events: [makeEvent({ actual_time: null, estimated_time: '2024-03-01T00:00:00Z' })],
    })
    const events = transformTracking(container)
    expect(events[0].occurredAt).toBeInstanceOf(Date)
  })

  it('passes schema parse for all events', () => {
    const events = transformTracking(makeContainer())
    events.forEach((e) => expect(() => TrackingEventSchema.parse(e)).not.toThrow())
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps id and container_number to id/trackingNumber', () => {
    const result = transformShipment(makeContainer())
    expect(result.id).toBe('ctr-001')
    expect(result.trackingNumber).toBe('MSCU1234567')
  })

  it('maps ocean fields (containerType, billOfLadingNumber, portOfLoading)', () => {
    const result = transformShipment(makeContainer())
    expect(result.ocean?.containerType).toBe('40HC')
    expect(result.ocean?.billOfLadingNumber).toBe('BL-2024-001')
    expect(result.ocean?.portOfLoading).toBe('CNSHA')
    expect(result.ocean?.portOfDischarge).toBe('USLAX')
  })

  it('sets mode to ocean', () => {
    expect(transformShipment(makeContainer()).mode).toBe('ocean')
  })

  it('maps estimatedArrival date', () => {
    const result = transformShipment(makeContainer())
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('maps pol city to originAddress.city', () => {
    const result = transformShipment(makeContainer())
    expect(result.originAddress?.city).toBe('Shanghai')
    expect(result.destinationAddress?.city).toBe('Los Angeles')
  })

  it('passes schema parse', () => {
    const result = transformShipment(makeContainer())
    expect(() => ShipmentSchema.parse(result)).not.toThrow()
  })
})
