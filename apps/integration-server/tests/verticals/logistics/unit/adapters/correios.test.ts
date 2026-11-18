import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type CorreiosTrackingResponse,
  type CorreiosEvento,
} from '../../../../../src/verticals/logistics/adapters/correios/transform/tracking'
import {
  transformRate,
  type CorreiosPreco,
} from '../../../../../src/verticals/logistics/adapters/correios/transform/rate'

// ─── Factories ───────────────────────────────────────────────────────────────

function makeEvento(overrides: Partial<CorreiosEvento> = {}): CorreiosEvento {
  return {
    tipo: 'DO',
    status: '01',
    dtHrCriado: '2024-03-15T10:30:00-03:00',
    descricao: 'Objeto encaminhado',
    unidade: {
      nome: 'Unidade de Tratamento',
      endereco: {
        cidade: 'Sao Paulo',
        uf: 'SP',
        cep: '01000-000',
        pais: 'BR',
      },
      tipo: 'Tratamento',
    },
    unidadeDestino: null,
    ...overrides,
  }
}

function makeTrackingResponse(overrides: Partial<CorreiosTrackingResponse> = {}): CorreiosTrackingResponse {
  return {
    objetos: [
      {
        codObjeto: 'BR123456789BR',
        tipoPostal: { sigla: 'PAC', descricao: 'PAC' },
        eventos: [
          makeEvento({ tipo: 'PAR', descricao: 'Objeto postado' }),
          makeEvento(),
        ],
      },
    ],
    ...overrides,
  }
}

function makePreco(overrides: Partial<CorreiosPreco> = {}): CorreiosPreco {
  return {
    coProduto: '04014',
    pcFinal: '25.50',
    pcBase: '22.00',
    prazoEntrega: 5,
    txErro: null,
    ...overrides,
  }
}

// ─── transformTracking ──────────────────────────────────────────────────────

describe('transformTracking', () => {
  it('produces events from all objects', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'BR123456789BR')
    expect(events).toHaveLength(2)
  })

  it('maps tracking event fields to canonical event', () => {
    const raw = makeTrackingResponse()
    const event = transformTracking(raw, 'BR123456789BR')[0]

    expect(event.trackingNumber).toBe('BR123456789BR')
    expect(event.carrierId).toBe('correios')
    expect(event.status).toBe('PRE_TRANSIT')
    expect(event.description).toBe('Objeto postado')
    expect(event.location?.city).toBe('Sao Paulo')
    expect(event.location?.state).toBe('SP')
    expect(event.location?.country).toBe('BR')
    expect(event.occurredAt).toBeInstanceOf(Date)
  })

  it('passes through metadata unmodified', () => {
    const raw = makeTrackingResponse()
    const events = transformTracking(raw, 'BR123456789BR')
    events.forEach((e) => expect(e.metadata).toBeDefined())
  })

  it('emits a single fallback event when no eventos exist', () => {
    const raw = makeTrackingResponse({
      objetos: [
        {
          codObjeto: 'BR123456789BR',
          tipoPostal: null,
          eventos: [],
        },
      ],
    })
    const events = transformTracking(raw, 'BR123456789BR')
    expect(events).toHaveLength(1)
    expect(events[0].status).toBe('UNKNOWN')
  })

  it('handles missing address gracefully', () => {
    const raw = makeTrackingResponse({
      objetos: [
        {
          codObjeto: 'BR123456789BR',
          tipoPostal: null,
          eventos: [makeEvento({ unidade: null })],
        },
      ],
    })
    const event = transformTracking(raw, 'BR123456789BR')[0]
    expect(event.location).toBeUndefined()
  })

  it('maps all statuses correctly', () => {
    const cases: [string, string][] = [
      ['BDE', 'DELIVERED'],
      ['BDI', 'FAILURE'],
      ['BDR', 'RETURN_TO_SENDER'],
      ['DO', 'IN_TRANSIT'],
      ['OEC', 'OUT_FOR_DELIVERY'],
      ['RO', 'IN_TRANSIT'],
      ['PAR', 'PRE_TRANSIT'],
      ['XYZ', 'UNKNOWN'],
    ]
    for (const [tipo, expected] of cases) {
      const raw = makeTrackingResponse({
        objetos: [
          {
            codObjeto: 'BR123456789BR',
            tipoPostal: null,
            eventos: [makeEvento({ tipo })],
          },
        ],
      })
      expect(transformTracking(raw, 'BR123456789BR')[0].status).toBe(expected)
    }
  })
})

// ─── transformRate ──────────────────────────────────────────────────────────

describe('transformRate', () => {
  it('maps canonical fields', () => {
    const raw = makePreco()
    const result = transformRate(raw)

    expect(result.id).toBe('04014')
    expect(result.carrierId).toBe('correios')
    expect(result.serviceCode).toBe('04014')
    expect(result.currency).toBe('BRL')
    expect(result.totalAmount).toBe(25.5)
    expect(result.transitDays).toBe(5)
    expect(result.deliveryDays).toBe(5)
  })

  it('passes through metadata unmodified', () => {
    const raw = makePreco()
    expect(transformRate(raw).metadata).toBe(raw)
  })

  it('handles missing prazoEntrega gracefully', () => {
    const raw = makePreco({ prazoEntrega: null })
    const result = transformRate(raw)
    expect(result.transitDays).toBeUndefined()
    expect(result.deliveryDays).toBeUndefined()
  })

  it('parses string pcFinal correctly', () => {
    const raw = makePreco({ pcFinal: '42.99' })
    expect(transformRate(raw).totalAmount).toBe(42.99)
  })

  it('handles numeric pcFinal', () => {
    const raw = makePreco({ pcFinal: 15.75 })
    expect(transformRate(raw).totalAmount).toBe(15.75)
  })
})
