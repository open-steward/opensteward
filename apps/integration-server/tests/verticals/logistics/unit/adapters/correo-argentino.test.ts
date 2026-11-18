import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type CorreoArgentinoTrackingResponse,
  type CorreoArgentinoTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/correo-argentino/transform/tracking'
import {
  transformShipment,
  type CorreoArgentinoEnvio,
} from '../../../../../src/verticals/logistics/adapters/correo-argentino/transform/shipment'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<CorreoArgentinoTrackingEvent> = {}): CorreoArgentinoTrackingEvent {
  return {
    estado: 'EN_TRANSITO',
    descripcion: 'Envio en transito hacia destino',
    fecha: '2024-11-20T14:00:00Z',
    sucursal: 'BA-CENTRO',
    ciudad: 'Buenos Aires',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<CorreoArgentinoTrackingResponse> = {}): CorreoArgentinoTrackingResponse {
  return {
    tracking_number: 'CA123456789AR',
    estado: 'EN_TRANSITO',
    eventos: [
      makeTrackingEvent({ estado: 'IMPUESTO', descripcion: 'Envio impuesto', ciudad: 'Cordoba' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeEnvio(overrides: Partial<CorreoArgentinoEnvio> = {}): CorreoArgentinoEnvio {
  return {
    envio_id: 'env-ca-001',
    tracking_number: 'CA123456789AR',
    estado: 'IMPUESTO',
    label_url: 'https://api.correoargentino.com.ar/labels/env-ca-001.pdf',
    servicio: 'CLASICO',
    peso: 2.5,
    peso_unidad: 'kg',
    remitente: {
      name: 'Juan Perez',
      address_line1: '123 Av Corrientes',
      city: 'Buenos Aires',
      state: 'CABA',
      postal_code: 'C1043',
      country: 'AR',
    },
    destinatario: {
      name: 'Maria Gonzalez',
      address_line1: '456 Av Colon',
      city: 'Cordoba',
      state: 'Cordoba',
      postal_code: 'X5000',
      country: 'AR',
    },
    created_at: '2024-11-20T10:00:00Z',
    updated_at: '2024-11-20T14:00:00Z',
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

    expect(event.trackingNumber).toBe('CA123456789AR')
    expect(event.carrierId).toBe('correo-argentino')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio impuesto')
    expect(event.location?.city).toBe('Cordoba')
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
    expect(events[0].trackingNumber).toBe('CA123456789AR')
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
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_DISTRIBUCION', 'OUT_FOR_DELIVERY'],
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

    expect(result.id).toBe('env-ca-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('CA123456789AR')
    expect(result.carrierId).toBe('correo-argentino')
    expect(result.serviceCode).toBe('CLASICO')
    expect(result.labelUrl).toContain('env-ca-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Juan Perez')
    expect(result.originAddress?.city).toBe('Buenos Aires')
    expect(result.destinationAddress?.name).toBe('Maria Gonzalez')
    expect(result.destinationAddress?.city).toBe('Cordoba')
  })

  it('maps weight', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.totalWeight?.value).toBe(2.5)
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
      ['EN_TRANSITO', 'IN_TRANSIT'],
      ['EN_DISTRIBUCION', 'OUT_FOR_DELIVERY'],
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
