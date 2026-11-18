import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type AndreaniTrackingResponse,
  type AndreaniTraza,
} from '../../../../../src/verticals/logistics/adapters/andreani/transform/tracking'
import {
  transformShipment,
  type AndreaniShipment,
} from '../../../../../src/verticals/logistics/adapters/andreani/transform/shipment'
import {
  transformRate,
  type AndreaniRate,
} from '../../../../../src/verticals/logistics/adapters/andreani/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeTraza(overrides: Partial<AndreaniTraza> = {}): AndreaniTraza {
  return {
    estado: 'EN_DISTRIBUCION',
    descripcion: 'Envio en distribucion',
    fecha: '2024-12-15T10:00:00Z',
    sucursal: 'BA-01',
    ciudad: 'Buenos Aires',
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<AndreaniTrackingResponse> = {}): AndreaniTrackingResponse {
  return {
    numero_envio: 'AND123456789',
    estado: 'EN_DISTRIBUCION',
    trazas: [
      makeTraza({ estado: 'PENDIENTE', descripcion: 'Envio recibido', ciudad: 'Cordoba' }),
      makeTraza(),
    ],
    ...overrides,
  }
}

function makeShipment(overrides: Partial<AndreaniShipment> = {}): AndreaniShipment {
  return {
    numero_envio: 'AND123456789',
    estado: 'PENDIENTE',
    servicio: 'ESTANDAR',
    label_url: 'https://api.andreani.com/labels/AND123456789.pdf',
    peso: 3.0,
    peso_unidad: 'kg',
    remitente: {
      name: 'Carlos Garcia',
      address_line1: '123 Av Corrientes',
      city: 'Buenos Aires',
      state: 'CABA',
      postal_code: 'C1043',
      country: 'AR',
    },
    destinatario: {
      name: 'Maria Lopez',
      address_line1: '456 Av Colon',
      city: 'Cordoba',
      state: 'Cordoba',
      postal_code: 'X5000',
      country: 'AR',
    },
    referencia: 'AR-ORD-001',
    created_at: '2024-12-15T08:00:00Z',
    updated_at: '2024-12-15T10:00:00Z',
    ...overrides,
  }
}

function makeRate(overrides: Partial<AndreaniRate> = {}): AndreaniRate {
  return {
    tarifa_id: 'T-AND-001',
    servicio: 'ESTANDAR',
    servicio_nombre: 'Envio Estandar',
    total: 1500.00,
    moneda: 'ARS',
    dias_transito: 3,
    fecha_entrega: '2024-12-18T00:00:00Z',
    created_at: '2024-12-15T08:00:00Z',
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces one event per traza', () => {
    expect(transformTracking(makeTrackingResponse())).toHaveLength(2)
  })

  it('maps traza fields to canonical event', () => {
    const event = transformTracking(makeTrackingResponse())[0]

    expect(event.trackingNumber).toBe('AND123456789')
    expect(event.carrierId).toBe('andreani')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Envio recibido')
    expect(event.location?.city).toBe('Cordoba')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    transformTracking(makeTrackingResponse()).forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when trazas is empty', () => {
    const events = transformTracking(makeTrackingResponse({ trazas: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles null ciudad gracefully', () => {
    const raw = makeTrackingResponse({ trazas: [makeTraza({ ciudad: null })] })
    expect(transformTracking(raw)[0].location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['PENDIENTE', 'PRE_TRANSIT'],
      ['EN_DISTRIBUCION', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'FAILURE'],
      ['DEVUELTO', 'RETURN_TO_SENDER'],
      ['something_else', 'UNKNOWN'],
    ]
    for (const [estado, expected] of cases) {
      const raw = makeTrackingResponse({ trazas: [makeTraza({ estado })] })
      expect(transformTracking(raw)[0].status).toBe(expected)
    }
  })
})

// ─── transformShipment ──────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const result = transformShipment(makeShipment())

    expect(result.id).toBe('AND123456789')
    expect(result.status).toBe('PENDING')
    expect(result.trackingNumber).toBe('AND123456789')
    expect(result.carrierId).toBe('andreani')
    expect(result.serviceCode).toBe('ESTANDAR')
    expect(result.reference).toBe('AR-ORD-001')
  })

  it('maps origin and destination addresses', () => {
    const result = transformShipment(makeShipment())
    expect(result.originAddress?.name).toBe('Carlos Garcia')
    expect(result.destinationAddress?.name).toBe('Maria Lopez')
  })

  it('maps weight', () => {
    const result = transformShipment(makeShipment())
    expect(result.totalWeight?.value).toBe(3.0)
    expect(result.totalWeight?.unit).toBe('kg')
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipment()
    expect(transformShipment(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeShipment({
      peso: null, peso_unidad: null, label_url: null, remitente: null,
      destinatario: null, servicio: null, estado: null,
      referencia: null, created_at: null, updated_at: null,
    })
    const result = transformShipment(raw)
    expect(result.totalWeight).toBeUndefined()
    expect(result.labelUrl).toBeUndefined()
    expect(result.originAddress).toBeUndefined()
    expect(result.destinationAddress).toBeUndefined()
  })

  it('maps all shipment statuses correctly', () => {
    const cases: [string | null, string][] = [
      ['PENDIENTE', 'PENDING'],
      ['EN_DISTRIBUCION', 'IN_TRANSIT'],
      ['EN_REPARTO', 'OUT_FOR_DELIVERY'],
      ['ENTREGADO', 'DELIVERED'],
      ['NO_ENTREGADO', 'EXCEPTION'],
      ['DEVUELTO', 'RETURNED'],
      ['CANCELADO', 'CANCELLED'],
      ['something_else', 'UNKNOWN'],
      [null, 'UNKNOWN'],
    ]
    for (const [estado, expected] of cases) {
      expect(transformShipment(makeShipment({ estado })).status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical rate fields', () => {
    const result = transformRate(makeRate())

    expect(result.id).toBe('T-AND-001')
    expect(result.carrierId).toBe('andreani')
    expect(result.serviceCode).toBe('ESTANDAR')
    expect(result.serviceName).toBe('Envio Estandar')
    expect(result.currency).toBe('ARS')
    expect(result.totalAmount).toBe(1500.00)
    expect(result.transitDays).toBe(3)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRate()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing optional fields gracefully', () => {
    const raw = makeRate({
      tarifa_id: null, servicio: null, servicio_nombre: null,
      total: null, moneda: null, dias_transito: null,
      fecha_entrega: null, created_at: null,
    })
    const result = transformRate(raw)
    expect(result.id).toBeUndefined()
    expect(result.totalAmount).toBeUndefined()
    expect(result.currency).toBe('ARS')
    expect(result.transitDays).toBeUndefined()
  })
})
