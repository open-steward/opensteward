import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type OcaTrackingResponse,
  type OcaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/oca/transform/tracking'
import {
  transformShipment,
  type OcaEnvio,
} from '../../../../../src/verticals/logistics/adapters/oca/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<OcaTrackingEvent> = {}): OcaTrackingEvent {
  return {
    estado: 'EN_CAMINO',
    descripcion: 'Envio en camino hacia destino',
    fecha: '2024-11-25T12:00:00Z',
    sucursal: 'BA-SUR',
    ciudad: 'Buenos Aires',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<OcaTrackingResponse> = {}): OcaTrackingResponse {
  return {
    tracking_number: 'OCA123456789AR',
    estado: 'EN_CAMINO',
    eventos: [
      makeTrackingEvent({ estado: 'IMPUESTO', descripcion: 'Envio impuesto', ciudad: 'Rosario' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeEnvio(overrides: Partial<OcaEnvio> = {}): OcaEnvio {
  return {
    envio_id: 'env-oca-001',
    tracking_number: 'OCA123456789AR',
    estado: 'IMPUESTO',
    label_url: 'https://api.oca.com.ar/labels/env-oca-001.pdf',
    servicio: 'PRIORITARIO',
    peso: 4.0,
    peso_unidad: 'kg',
    remitente: {
      name: 'Luis Fernandez',
      address_line1: '789 Av San Martin',
      city: 'Buenos Aires',
      state: 'CABA',
      postal_code: 'C1417',
      country: 'AR',
    },
    destinatario: {
      name: 'Sofia Romero',
      address_line1: '321 Bv Orono',
      city: 'Rosario',
      state: 'Santa Fe',
      postal_code: 'S2000',
      country: 'AR',
    },
    created_at: '2024-11-25T08:00:00Z',
    updated_at: '2024-11-25T12:00:00Z',
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

    expect(event.trackingNumber).toBe('OCA123456789AR')
    expect(event.carrierId).toBe('oca')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio impuesto')
    expect(event.location?.city).toBe('Rosario')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw)
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when events is empty', () => {
    const raw = makeTrackingResponse({ eventos: [] })
    const events = transformTracking(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
    expect(events[0].trackingNumber).toBe('OCA123456789AR')
  })

  it('handles null ciudad gracefully', () => {
    const raw = makeTrackingResponse({
      eventos: [makeTrackingEvent({ ciudad: null })],
    })
    const event = transformTracking(raw)[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['IMPUESTO', 'PRE_TRANSIT'],
      ['EN_CAMINO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'FAILURE'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [estado, expected] of cases) {
      const raw = makeTrackingResponse({
        eventos: [makeTrackingEvent({ estado })],
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

    expect(result.id).toBe('env-oca-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('OCA123456789AR')
    expect(result.carrierId).toBe('oca')
    expect(result.serviceCode).toBe('PRIORITARIO')
    expect(result.labelUrl).toContain('env-oca-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Luis Fernandez')
    expect(result.originAddress?.city).toBe('Buenos Aires')
    expect(result.destinationAddress?.name).toBe('Sofia Romero')
    expect(result.destinationAddress?.city).toBe('Rosario')
  })

  it('maps weight', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(4.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeEnvio()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeEnvio({
      peso: null,
      peso_unidad: null,
      label_url: null,
      remitente: null,
      destinatario: null,
      servicio: null,
      estado: null,
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
      ['IMPUESTO', 'PENDING'],
      ['EN_CAMINO', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'EXCEPTION'],
      ['DEVUELTO', 'RETURNED'],
      ['CANCELADO', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [estado, expected] of cases) {
      const raw = makeEnvio({ estado })
      expect(transformShipment(raw).status).toBe(expected)
    }
  })
})
