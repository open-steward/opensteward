import { describe, it, expect } from 'vitest'
import { transformTrackingEvents, type CorreosTrackingResponse, type CorreosTrackingEvent } from '../../../../../src/verticals/logistics/adapters/correos/transform/tracking'
import { transformShipment, type CorreosShipmentResponse } from '../../../../../src/verticals/logistics/adapters/correos/transform/shipment'
import { transformRate, type CorreosRateResponse } from '../../../../../src/verticals/logistics/adapters/correos/transform/rate'

// ─── Factories ────────────────────────────────────────────────────────────────

function makeRateResponse(overrides: Partial<CorreosRateResponse> = {}): CorreosRateResponse {
  return {
    codigoServicio: 'PAQ_PREMIUM',
    nombreServicio: 'Paq Premium',
    precio: 8.50,
    moneda: 'EUR',
    fechaEntregaEstimada: '2024-01-20T00:00:00Z',
    ...overrides,
  }
}

function makeTrackingEvent(overrides: Partial<CorreosTrackingEvent> = {}): CorreosTrackingEvent {
  return {
    fecha: '2024-01-16T14:30:00Z',
    estado: 'EN_TRANSITO',
    descripcion: 'Envio en transito',
    ubicacion: {
      localidad: 'Madrid',
      provincia: 'Madrid',
      codigoPostal: '28001',
      pais: 'ES',
    },
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<CorreosTrackingResponse> = {}): CorreosTrackingResponse {
  return {
    codigoEnvio: 'PQ1234567890ES',
    estadoActual: 'EN_TRANSITO',
    descripcionEstado: 'Envio en transito',
    eventos: [makeTrackingEvent()],
    ...overrides,
  }
}

function makeShipmentResponse(overrides: Partial<CorreosShipmentResponse> = {}): CorreosShipmentResponse {
  return {
    codigoEnvio: 'ENV-001',
    codigoSeguimiento: 'PQ1234567890ES',
    codigoServicio: 'PAQ_PREMIUM',
    estado: 'CREATED',
    fechaCreacion: '2024-01-16T10:00:00Z',
    ...overrides,
  }
}

// ─── transformRate ────────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makeRateResponse()
    const result = transformRate(raw)

    expect(result.carrierId).toBe('correos')
    expect(result.serviceCode).toBe('PAQ_PREMIUM')
    expect(result.serviceName).toBe('Paq Premium')
    expect(result.currency).toBe('EUR')
    expect(result.totalAmount).toBe(8.50)
    expect(result.estimatedDeliveryAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeRateResponse()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing delivery date', () => {
    const raw = makeRateResponse({ fechaEntregaEstimada: undefined })
    expect(transformRate(raw).estimatedDeliveryAt).toBeUndefined()
  })

  it('defaults currency to EUR', () => {
    const raw = makeRateResponse({ moneda: undefined })
    expect(transformRate(raw).currency).toBe('EUR')
  })
})

// ─── transformTrackingEvents ────────────────────────────────────────────────

describe('transformTrackingEvents', () => {
  it('produces one event per tracking event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
  })

  it('maps event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTrackingEvents(raw)[0]

    expect(event.trackingNumber).toBe('PQ1234567890ES')
    expect(event.carrierId).toBe('correos')
    expect(event.status).toBe('IN_TRANSIT')
    expect(event.description).toBe('Envio en transito')
    expect(event.location?.city).toBe('Madrid')
    expect(event.location?.state).toBe('Madrid')
    expect(event.location?.country).toBe('ES')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata on every event', () => {
    const raw = makeTrackingResponse()
    const events = transformTrackingEvents(raw)
    events.forEach((e) => expect(e.metadata).toBe(raw))
  })

  it('emits a single summary event when events is empty', () => {
    const raw = makeTrackingResponse({ eventos: [] })
    const events = transformTrackingEvents(raw)
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('maps ADMITIDO to PRE_TRANSIT', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'ADMITIDO' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('PRE_TRANSIT')
  })

  it('maps ENTREGADO to DELIVERED', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'ENTREGADO' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('DELIVERED')
  })

  it('maps EN_REPARTO to OUT_FOR_DELIVERY', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'EN_REPARTO' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps AUSENTE to FAILURE', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'AUSENTE' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('FAILURE')
  })

  it('maps DEVUELTO to RETURN_TO_SENDER', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'DEVUELTO' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('RETURN_TO_SENDER')
  })

  it('maps EN_OFICINA to AVAILABLE_FOR_PICKUP', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'EN_OFICINA' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps unknown status to UNKNOWN', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ estado: 'ZZ_UNKNOWN' })] })
    expect(transformTrackingEvents(raw)[0].status).toBe('UNKNOWN')
  })

  it('handles missing location gracefully', () => {
    const raw = makeTrackingResponse({ eventos: [makeTrackingEvent({ ubicacion: undefined })] })
    expect(transformTrackingEvents(raw)[0].location).toBeUndefined()
  })
})

// ─── transformShipment ───────────────────────────────────────────────────────

describe('transformShipment', () => {
  it('maps canonical fields', () => {
    const raw = makeShipmentResponse()
    const result = transformShipment(raw)

    expect(result.id).toBe('ENV-001')
    expect(result.status).toBe('LABEL_CREATED')
    expect(result.trackingNumber).toBe('PQ1234567890ES')
    expect(result.carrierId).toBe('correos')
    expect(result.serviceCode).toBe('PAQ_PREMIUM')
    expect(result.createdAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeShipmentResponse()
    expect(transformShipment(raw).metadata).toBe(raw)
  })
})
