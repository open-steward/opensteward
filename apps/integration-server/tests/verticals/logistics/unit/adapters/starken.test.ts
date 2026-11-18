import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type StarkenTrackingResponse,
  type StarkenTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/starken/transform/tracking'
import {
  transformShipment,
  type StarkenEnvio,
} from '../../../../../src/verticals/logistics/adapters/starken/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<StarkenTrackingEvent> = {}): StarkenTrackingEvent {
  return {
    status: 'EN_TRANSITO',
    description: 'Envio en transito',
    timestamp: '2024-03-15T10:30:00Z',
    location: 'Santiago Hub',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<StarkenTrackingResponse> = {}): StarkenTrackingResponse {
  return {
    tracking_number: 'STK123456789',
    status: 'EN_TRANSITO',
    events: [
      makeTrackingEvent({ status: 'INGRESADO', description: 'Envio ingresado', location: 'Santiago' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeEnvio(overrides: Partial<StarkenEnvio> = {}): StarkenEnvio {
  return {
    envio_id: 'env-abc-123',
    tracking_number: 'STK123456789',
    status: 'INGRESADO',
    label_url: 'https://api.starken.cl/labels/env-abc-123.pdf',
    service_code: 'NORMAL',
    weight: 5.0,
    weight_unit: 'kg',
    sender: {
      name: 'Carlos Lopez',
      address_line1: '100 Alameda',
      city: 'Santiago',
      postal_code: '8320000',
      country: 'CL',
    },
    recipient: {
      name: 'Maria Gonzalez',
      address_line1: '200 Costanera',
      city: 'Valparaiso',
      postal_code: '2340000',
      country: 'CL',
    },
    created_at: '2024-03-15T09:00:00Z',
    updated_at: '2024-03-15T10:30:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw)[0]

    expect(event.trackingNumber).toBe('STK123456789')
    expect(event.carrierId).toBe('starken')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio ingresado')
    expect(event.location?.city).toBe('Santiago')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ events: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('STK123456789')
  })

  it('handles null location gracefully', () => {
    const raw = makeTrackingResponse({
      events: [makeTrackingEvent({ location: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['INGRESADO', 'PRE_TRANSIT'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'FAILURE'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeTrackingResponse({
        events: [makeTrackingEvent({ status })],
      })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.id).toBe('env-abc-123')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('STK123456789')
    expect(result.carrierId).toBe('starken')
    expect(result.serviceCode).toBe('NORMAL')
    expect(result.labelUrl).toContain('env-abc-123.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Carlos Lopez')
    expect(result.originAddress?.city).toBe('Santiago')
    expect(result.destinationAddress?.name).toBe('Maria Gonzalez')
    expect(result.destinationAddress?.city).toBe('Valparaiso')
  })

  it('maps weight', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(5.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeEnvio()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeEnvio({
      weight: null,
      weight_unit: null,
      label_url: null,
      sender: null,
      recipient: null,
      service_code: null,
      status: null,
      created_at: null,
      updated_at: null,
    })
    const result = transformShipment(raw)

    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
    expect(result.serviceCode).toBeUndefined()
    expect(result.createdAt).toBeUndefined()
    expect(result.updatedAt).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['INGRESADO', 'PENDING'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'EXCEPTION'],
      ['DEVUELTO', 'RETURNED'],
      ['CANCELADO', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [status, expected] of cases) {
      const raw = makeEnvio({ status })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
