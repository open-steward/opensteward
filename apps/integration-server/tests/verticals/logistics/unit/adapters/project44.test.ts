import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type Project44TrackingResult, type Project44TrackingStop } from '../../../../../src/verticals/logistics/adapters/project44/transform/tracking'
import { transformShipment, type Project44ShipmentResponse } from '../../../../../src/verticals/logistics/adapters/project44/transform/shipment'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeTrackingStop(overrides: Partial<Project44TrackingStop> = {}): Project44TrackingStop {
  return {
    dateTime: '2024-01-16T14:30:00Z',
    status: 'In Transit',
    description: 'Shipment in transit',
    location: {
      city: 'Chicago',
      state: 'IL',
      postalCode: '60601',
      country: 'US',
    },
    ...overrides,
  }
}

function makeTrackingResult(overrides: Partial<Project44TrackingResult> = {}): Project44TrackingResult {
  return {
    shipmentId: 'SHP-001',
    trackingNumber: '1Z999AA10123456784',
    carrierCode: 'UPS',
    status: 'In Transit',
    statusDescription: 'Shipment in transit',
    stops: [makeTrackingStop()],
    estimatedDeliveryDate: '2024-01-18T12:00:00Z',
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<Project44ShipmentResponse> = {}): Project44ShipmentResponse {
  return {
    id: 'SHP-001',
    status: 'In Transit',
    trackingNumber: '1Z999AA10123456784',
    carrierCode: 'UPS',
    mode: 'TL',
    originCity: 'Los Angeles',
    originState: 'CA',
    originCountry: 'US',
    destinationCity: 'New York',
    destinationState: 'NY',
    destinationCountry: 'US',
    estimatedDeliveryDate: '2024-01-18T12:00:00Z',
    createdAt: '2024-01-14T10:00:00Z',
    updatedAt: '2024-01-16T14:00:00Z',
    ...overrides,
  }
}

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per stop', () => {
    const raw = makeTrackingResult()
    expect(transformTrackingEvents(raw)).toHaveLength(1)
  })

  it('maps stop fields to canonical event', () => {
    const raw = makeTrackingResult()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('1Z999AA10123456784')
    expect(event.carrierId).toBe('project44')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Shipment in transit')
    expect(event.location?.city).toBe('Chicago')
    expect(event.location?.state).toBe('IL')
    expect(event.location?.country).toBe('US')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata', () => {
    const raw = makeTrackingResult()
    transformTrackingEvents(raw).forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits summary when stops is empty', () => {
    const raw = makeTrackingResult({ stops: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps Info Received to PRE_TRANSIT', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Info Received' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps Picked Up to PRE_TRANSIT', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Picked Up' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps Out for Delivery to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Out for Delivery' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Delivered' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps Exception to FAILURE', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Exception' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps Delayed to FAILURE', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'Delayed' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ status: 'ZZ_Unknown' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing location', () => {
    const raw = makeTrackingResult({ stops: [makeTrackingStop({ location: undefined })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })

  it('uses shipmentId when trackingNumber is absent', () => {
    const raw = makeTrackingResult({ trackingNumber: undefined })
    expect(transformTrackingEvents(raw)[0].trackingNumber).toBe('SHP-001')
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('SHP-001')
    expect(result.status).toBe('IN_TRANSIT')
    expect(result.trackingNumber).toBe('1Z999AA10123456784')
    expect(result.carrierId).toBe('UPS')
    expect(result.serviceCode).toBe('TL')
    expect(result.originAddress?.city).toBe('Los Angeles')
    expect(result.originAddress?.state).toBe('CA')
    expect(result.destinationAddress?.city).toBe('New York')
    expect(result.destinationAddress?.state).toBe('NY')
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('maps Info Received to PENDING', () => {
    const raw = makeShipmentResponse({ status: 'Info Received' })
    expect(transformShipment(raw).status).toBe('PENDING')
  })

  it('maps Out for Delivery to OUT_FOR_DELIVERY', () => {
    const raw = makeShipmentResponse({ status: 'Out for Delivery' })
    expect(transformShipment(raw).status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps Delivered to DELIVERED', () => {
    const raw = makeShipmentResponse({ status: 'Delivered' })
    expect(transformShipment(raw).status).toBe('DELIVERED')
  })

  it('maps Exception to EXCEPTION', () => {
    const raw = makeShipmentResponse({ status: 'Exception' })
    expect(transformShipment(raw).status).toBe('EXCEPTION')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeShipmentResponse({ status: 'zz_unknown' })
    expect(transformShipment(raw).status).toBe('UNKNOWN')
  })

  it('handles missing origin/destination', () => {
    const raw = makeShipmentResponse({
      originCity: undefined,
      originState: undefined,
      destinationCity: undefined,
      destinationState: undefined,
    })
    const result = transformShipment(raw)
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('uses project44 as carrierId when carrierCode is missing', () => {
    const raw = makeShipmentResponse({ carrierCode: undefined })
    expect(transformShipment(raw).carrierId).toBe('project44')
  })
})
