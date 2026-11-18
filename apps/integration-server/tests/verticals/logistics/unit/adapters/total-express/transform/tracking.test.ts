import { describe, it, expect } from 'vitest'
import {
  transformTrackingEvent,
  transformTracking,
  type TotalExpressTrackingEvent,
  type TotalExpressShipment,
} from '../../../../../../../src/verticals/logistics/adapters/total-express/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeRawEvent(
  overrides: Partial<TotalExpressTrackingEvent> = {},
): TotalExpressTrackingEvent {
  return {
    id: 42,
    shipment_id: 'shp-te-001',
    tracking_number: 'BR123456789BR',
    codigo_rastreio: 'BR123456789BR',
    status: 'EM_TRANSITO',
    descricao: 'Objeto em trânsito',
    city: 'São Paulo',
    state: 'SP',
    country: 'BR',
    data_ocorrencia: '2024-03-01T00:00:00Z',
    ...overrides,
  }
}

function makeShipment(overrides: Partial<TotalExpressShipment> = {}): TotalExpressShipment {
  return {
    id: 'shp-te-001',
    numero_objeto: 'BR123456789BR',
    status: 'EM_TRANSITO',
    eventos: [makeRawEvent()],
    data_criacao: '2024-03-01T00:00:00Z',
    data_atualizacao: '2024-03-02T00:00:00Z',
    ...overrides,
  }
}

describe('total-express transformTrackingEvent', () => {
  it('maps id to string', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.id).toBe('42')
  })

  it('maps shipment_id', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.shipmentId).toBe('shp-te-001')
  })

  it('uses shipmentId arg as fallback when raw.shipment_id absent', () => {
    const r = transformTrackingEvent(makeRawEvent({ shipment_id: undefined }), 'arg-shp')
    expect(r.shipmentId).toBe('arg-shp')
  })

  it('maps codigo_rastreio → trackingNumber', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.trackingNumber).toBe('BR123456789BR')
  })

  it('falls back to raw.tracking_number when codigo_rastreio absent', () => {
    const r = transformTrackingEvent(makeRawEvent({ codigo_rastreio: undefined }))
    expect(r.trackingNumber).toBe('BR123456789BR')
  })

  it('falls back to trackingNumber arg', () => {
    const r = transformTrackingEvent(
      makeRawEvent({ codigo_rastreio: undefined, tracking_number: undefined }),
      undefined,
      'arg-trk',
    )
    expect(r.trackingNumber).toBe('arg-trk')
  })

  it('hardcodes carrierId to total-express', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.carrierId).toBe('total-express')
  })

  it('maps EM_TRANSITO → IN_TRANSIT', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.status).toBe('IN_TRANSIT')
  })

  it('maps descricao → description', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.description).toBe('Objeto em trânsito')
  })

  it('falls back to description field when descricao absent', () => {
    const r = transformTrackingEvent(
      makeRawEvent({ descricao: undefined, description: 'In transit' }),
    )
    expect(r.description).toBe('In transit')
  })

  it('builds city/state location when city is present', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.location?.city).toBe('São Paulo')
    expect(r.location?.state).toBe('SP')
    expect(r.location?.country).toBe('BR')
  })

  it('defaults country to BR when absent', () => {
    const r = transformTrackingEvent(makeRawEvent({ country: undefined }))
    expect(r.location?.country).toBe('BR')
  })

  it('falls back to street1 from local when city and state absent', () => {
    const r = transformTrackingEvent(
      makeRawEvent({ city: undefined, state: undefined, local: 'CD São Paulo' }),
    )
    expect(r.location?.street1).toBe('CD São Paulo')
    expect(r.location?.city).toBeUndefined()
  })

  it('maps data_ocorrencia → occurredAt as Date', () => {
    const r = transformTrackingEvent(makeRawEvent())
    expect(r.occurredAt).toBeInstanceOf(Date)
    expect(r.occurredAt?.toISOString()).toBe('2024-03-01T00:00:00.000Z')
  })

  it('falls back to timestamp when data_ocorrencia absent', () => {
    const r = transformTrackingEvent(
      makeRawEvent({ data_ocorrencia: undefined, timestamp: '2024-03-02T00:00:00Z' }),
    )
    expect(r.occurredAt?.toISOString()).toBe('2024-03-02T00:00:00.000Z')
  })

  it('maps status values correctly', () => {
    const cases: Array<[string, string]> = [
      ['CRIADO', 'PRE_TRANSIT'],
      ['PENDENTE', 'PRE_TRANSIT'],
      ['AGUARDANDO_COLETA', 'PRE_TRANSIT'],
      ['CREATED', 'PRE_TRANSIT'],
      ['PENDING', 'PRE_TRANSIT'],
      ['COLETADO', 'IN_TRANSIT'],
      ['EM_TRANSITO', 'IN_TRANSIT'],
      ['IN_TRANSIT', 'IN_TRANSIT'],
      ['TRANSIT', 'IN_TRANSIT'],
      ['SAIU_PARA_ENTREGA', 'OUT_FOR_DELIVERY'],
      ['OUT_FOR_DELIVERY', 'OUT_FOR_DELIVERY'],
      ['ENTREGUE', 'DELIVERED'],
      ['DELIVERED', 'DELIVERED'],
      ['DISPONIVEL_PARA_RETIRADA', 'AVAILABLE_FOR_PICKUP'],
      ['AVAILABLE_FOR_PICKUP', 'AVAILABLE_FOR_PICKUP'],
      ['DEVOLVIDO', 'RETURN_TO_SENDER'],
      ['EM_DEVOLUCAO', 'RETURN_TO_SENDER'],
      ['RETURNED', 'RETURN_TO_SENDER'],
      ['RETURN_TO_SENDER', 'RETURN_TO_SENDER'],
      ['FALHOU', 'FAILURE'],
      ['NAO_ENTREGUE', 'FAILURE'],
      ['CANCELADO', 'FAILURE'],
      ['FAILED', 'FAILURE'],
      ['UNDELIVERED', 'FAILURE'],
      ['CANCELLED', 'FAILURE'],
      ['BOGUS', 'UNKNOWN'],
    ]
    for (const [s, expected] of cases) {
      const r = transformTrackingEvent(makeRawEvent({ status: s }))
      expect(r.status, `status: ${s}`).toBe(expected)
    }
  })

  it('passes TrackingEventSchema validation', () => {
    const result = transformTrackingEvent(makeRawEvent())
    expect(() => TrackingEventSchema.parse(result)).not.toThrow()
  })
})

describe('total-express transformTracking (shipment)', () => {
  it('maps eventos array → one TrackingEvent per entry', () => {
    const r = transformTracking(makeShipment({ eventos: [makeRawEvent(), makeRawEvent()] }))
    expect(r).toHaveLength(2)
  })

  it('uses events field when eventos is absent', () => {
    const r = transformTracking(makeShipment({ eventos: undefined, events: [makeRawEvent()] }))
    expect(r).toHaveLength(1)
  })

  it('emits synthetic event when no eventos/events', () => {
    const r = transformTracking(makeShipment({ eventos: undefined, events: undefined }))
    expect(r).toHaveLength(1)
    expect(r[0].carrierId).toBe('total-express')
    expect(r[0].status).toBe('IN_TRANSIT')
  })

  it('derives shipmentId from id', () => {
    const r = transformTracking(makeShipment({ eventos: [] }))
    expect(r[0].shipmentId).toBe('shp-te-001')
  })

  it('derives trackingNumber from numero_objeto', () => {
    const r = transformTracking(makeShipment({ eventos: [] }))
    expect(r[0].trackingNumber).toBe('BR123456789BR')
  })

  it('uses data_atualizacao for synthetic event occurredAt', () => {
    const r = transformTracking(makeShipment({ eventos: [] }))
    expect(r[0].occurredAt?.toISOString()).toBe('2024-03-02T00:00:00.000Z')
  })

  it('passes TrackingEventSchema validation for all events', () => {
    const result = transformTracking(makeShipment())
    for (const event of result) {
      expect(() => TrackingEventSchema.parse(event)).not.toThrow()
    }
  })
})
