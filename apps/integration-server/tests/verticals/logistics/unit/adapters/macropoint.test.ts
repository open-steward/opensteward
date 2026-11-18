import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type MacropointTrackingResponse, type MacropointTrackingEvent } from '../../../../../src/verticals/logistics/adapters/macropoint/transform/tracking'
import { transformShipment, type MacropointShipmentResponse } from '../../../../../src/verticals/logistics/adapters/macropoint/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<MacropointTrackingEvent> = {}): MacropointTrackingEvent {
  return {
    timestamp: '2024-01-16T14:30:00Z',
    status: 'IN_TRANSIT',
    description: 'Shipment in transit',
    location: {
      address: '123 Main St',
      city: 'Chicago',
      state: 'IL',
      zipCode: '60601',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<MacropointTrackingResponse> = {}): MacropointTrackingResponse {
  return {
    loadId: 'LOAD-001',
    status: 'IN_TRANSIT',
    statusDescription: 'Shipment in transit',
    events: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<MacropointShipmentResponse> = {}): MacropointShipmentResponse {
  return {
    id: 'LOAD-001',
    referenceNumber: 'REF-123456',
    serviceType: 'FTL',
    status: 'CREATED',
    createdAt: '2024-01-16T10:00:00Z',
    totalWeight: {
      value: 15000,
      unit: 'LBS',
    },
    ...overrides,
  }
}

// ─── transformTrackingEvents ──────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('LOAD-001')
    expect(event.carrierId).toBe('macropoint')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.street1).toBe('123 Main St')
    expect(event.location?.city).toBe('Chicago')
    expect(event.location?.state).toBe('IL')
    expect(event.location?.postalCode).toBe('60601')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['CREATED', 'PRE_TRANSIT'],
      ['TRACKING', 'IN_TRANSIT'],
      ['AT_PICKUP', 'PRE_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['AT_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['DELIVERED', 'DELIVERED'],
      ['STOPPED', 'FAILURE'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({ events: [makeTrackingEvent({ status })] })
      expect(transformTrackingEvents(raw)[0].status).toBe(expected)
    }
  })

  it('handles missing location gracefully', () => {
    const raw = makeTrackingResponse({ events: [makeTrackingEvent({ location: undefined })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('LOAD-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('REF-123456')
    expect(result.carrierId).toBe('macropoint')
    expect(result.serviceCode).toBe('FTL')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
