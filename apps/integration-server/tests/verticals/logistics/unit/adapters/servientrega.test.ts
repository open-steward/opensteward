import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type ServientregaTrackingResponse,
  type ServientregaTrackingEvent,
} from '../../../../../src/verticals/logistics/adapters/servientrega/transform/tracking'
import {
  transformShipment,
  type ServientregaEnvio,
} from '../../../../../src/verticals/logistics/adapters/servientrega/transform/shipment'
import {
  transformRate,
  type ServientregaRate,
} from '../../../../../src/verticals/logistics/adapters/servientrega/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTrackingEvent(overrides: Partial<ServientregaTrackingEvent> = {}): ServientregaTrackingEvent {
  return {
    estado: 'EN_TRANSITO',
    descripcion: 'Envio en transito hacia destino',
    fecha: '2024-12-01T15:00:00Z',
    sucursal: 'BOG-NORTE',
    ciudad: 'Bogota',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<ServientregaTrackingResponse> = {}): ServientregaTrackingResponse {
  return {
    guia_number: 'SRV123456789CO',
    estado: 'EN_TRANSITO',
    eventos: [
      makeTrackingEvent({ estado: 'RECOGIDO', descripcion: 'Envio recogido', ciudad: 'Medellin' }),
      makeTrackingEvent(),
    ],
    ...overrides,
  }
}

function makeEnvio(overrides: Partial<ServientregaEnvio> = {}): ServientregaEnvio {
  return {
    envio_id: 'env-srv-001',
    guia_number: 'SRV123456789CO',
    estado: 'RECOGIDO',
    label_url: 'https://api.servientrega.com/labels/env-srv-001.pdf',
    servicio: 'MERCANCIA',
    peso: 5.0,
    peso_unidad: 'kg',
    remitente: {
      name: 'Carlos Rodriguez',
      address_line1: '123 Carrera 7',
      city: 'Bogota',
      state: 'Cundinamarca',
      postal_code: '110111',
      country: 'CO',
    },
    destinatario: {
      name: 'Ana Martinez',
      address_line1: '456 Calle 10',
      city: 'Medellin',
      state: 'Antioquia',
      postal_code: '050001',
      country: 'CO',
    },
    created_at: '2024-12-01T10:00:00Z',
    updated_at: '2024-12-01T15:00:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<ServientregaRate> = {}): ServientregaRate {
  return {
    cotizacion_id: 'C-SRV-001',
    servicio: 'MERCANCIA',
    servicio_nombre: 'Envio de Mercancia',
    total: 25000.00,
    moneda: 'COP',
    dias_transito: 2,
    fecha_entrega: '2024-12-03T18:00:00Z',
    created_at: '2024-12-01T10:00:00Z',
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

    expect(event.trackingNumber).toBe('SRV123456789CO')
    expect(event.carrierId).toBe('servientrega')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio recogido')
    expect(event.location?.city).toBe('Medellin')
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
    expect(events[0].trackingNumber).toBe('SRV123456789CO')
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
      ['RECOGIDO', 'PRE_TRANSIT'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
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

    expect(result.id).toBe('env-srv-001')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('SRV123456789CO')
    expect(result.carrierId).toBe('servientrega')
    expect(result.serviceCode).toBe('MERCANCIA')
    expect(result.labelUrl).toContain('env-srv-001.pdf')
    expect(result.createdAt).toBeInstanceOf(Date)
    expect(result.updatedAt).toBeInstanceOf(Date)
  })

  it('maps origin and destination addresses', () => {
    const raw = makeEnvio()
    const result = transformShipment(raw)

    expect(result.originAddress?.name).toBe('Carlos Rodriguez')
    expect(result.originAddress?.city).toBe('Bogota')
    expect(result.destinationAddress?.name).toBe('Ana Martinez')
    expect(result.destinationAddress?.city).toBe('Medellin')
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
      ['RECOGIDO', 'PENDING'],
      ['EN_TRANSITO', 'IN_TRANSIT'],
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

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('C-SRV-001')
    expect(result.carrierId).toBe('servientrega')
    expect(result.serviceCode).toBe('MERCANCIA')
    expect(result.serviceName).toBe('Envio de Mercancia')
    expect(result.currency).toBe('COP')
    expect(result.totalAmount).toBe(25000.00)
    expect(result.transitDays).toBe(2)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      cotizacion_id: null, servicio: null, servicio_nombre: null,
      total: null, moneda: null, dias_transito: null,
      fecha_entrega: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('COP')
    expect(result.transitDays).toBeUndefined()
    expect(result.estimatedDeliveryAt).toBeUndefined()
  })
})
