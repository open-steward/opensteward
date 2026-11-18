import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type JadlogTrackingResponse,
  type JadlogTrackingDetail,
} from '../../../../../../../src/verticals/logistics/adapters/jadlog/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function makeDetail(overrides: Partial<JadlogTrackingDetail> = {}): JadlogTrackingDetail {
  return {
    descricao: 'Objeto em trânsito',
    status: 'EM',
    dataHora: '2024-03-02T10:00:00Z',
    cidade: 'São Paulo',
    uf: 'SP',
    ...overrides,
  }
}

function makeRaw(overrides: Partial<JadlogTrackingResponse> = {}): JadlogTrackingResponse {
  return {
    codigo: 'COD001',
    cte: 'CTE001',
    shipmentId: 'SHP001',
    status: 'EM',
    tracking: [makeDetail()],
    ...overrides,
  }
}

describe('jadlog transformTracking', () => {
  it('produces one event per tracking detail', () => {
    expect(transformTracking(makeRaw())).toHaveLength(1)
  })

  it('maps codigo as trackingNumber', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.trackingNumber).toBe('COD001')
  })

  it('maps carrierId to jadlog', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.carrierId).toBe('jadlog')
  })

  it('maps EM status to IN_TRANSIT', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.status).toBe('IN_TRANSIT')
  })

  it('maps SA status to OUT_FOR_DELIVERY', () => {
    const [e] = transformTracking(makeRaw({ tracking: [makeDetail({ status: 'SA' })] }))
    expect(e.status).toBe('OUT_FOR_DELIVERY')
  })

  it('maps EN status to DELIVERED', () => {
    const [e] = transformTracking(makeRaw({ tracking: [makeDetail({ status: 'EN' })] }))
    expect(e.status).toBe('DELIVERED')
  })

  it('maps DV to RETURN_TO_SENDER', () => {
    const [e] = transformTracking(makeRaw({ tracking: [makeDetail({ status: 'DV' })] }))
    expect(e.status).toBe('RETURN_TO_SENDER')
  })

  it('maps AG to AVAILABLE_FOR_PICKUP', () => {
    const [e] = transformTracking(makeRaw({ tracking: [makeDetail({ status: 'AG' })] }))
    expect(e.status).toBe('AVAILABLE_FOR_PICKUP')
  })

  it('maps PE to PRE_TRANSIT', () => {
    const [e] = transformTracking(makeRaw({ tracking: [makeDetail({ status: 'PE' })] }))
    expect(e.status).toBe('PRE_TRANSIT')
  })

  it('maps description from descricao', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.description).toBe('Objeto em trânsito')
  })

  it('sets location from cidade and uf', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.location?.city).toBe('São Paulo')
    expect(e.location?.state).toBe('SP')
    expect(e.location?.country).toBe('BR')
  })

  it('occurredAt is a Date', () => {
    const [e] = transformTracking(makeRaw())
    expect(e.occurredAt).toBeInstanceOf(Date)
  })

  it('emits summary event when tracking is empty', () => {
    const events = transformTracking(makeRaw({ tracking: [] }))
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('IN_TRANSIT')
  })

  it('location is undefined when detail has no location fields', () => {
    const [e] = transformTracking(
      makeRaw({ tracking: [makeDetail({ cidade: null, uf: null, unidade: null })] }),
    )
    expect(e.location).toBeUndefined()
  })

  it('passes schema validation for each event', () => {
    transformTracking(makeRaw()).forEach((e) =>
      expect(() => TrackingEventSchema.parse(e)).not.toThrow(),
    )
  })
})
