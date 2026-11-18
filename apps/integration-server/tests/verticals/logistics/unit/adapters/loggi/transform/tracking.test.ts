/**
 * transformTracking flattens `v1TrackPackageTrackingCodeResponse.packages[].trackingHistory`
 * (GET /v1/companies/{company_id}/packages/{tracking_code}/tracking,
 * https://docs.api.loggi.com/reference/trackpackagetrackingcode). The fixture
 * uses the schema's per-property `example` values where the schema gives one.
 * `status.updatedTime` has none, so its timestamps are illustrative values of
 * the documented date-time format. The code 14 "Coletado" entry takes its label
 * and description from the V2 table at https://docs.api.loggi.com/reference/trackingapi.
 */
import { describe, it, expect } from 'vitest'
import {
  transformTracking,
  type LoggiTrackingResponse,
} from '../../../../../../../src/verticals/logistics/adapters/loggi/transform/tracking'
import { TrackingEventSchema } from '../../../../../../../src/verticals/logistics/schema/trackingevent'

function documentedTracking(): LoggiTrackingResponse {
  return {
    packages: [
      {
        loggiKey: 'KIF511LG3LGGA3U8G28B4200NA',
        trackingCode: 'AM1007503594LG',
        status: { code: 6, highLevelStatus: 'Com problema' },
        trackingHistory: [
          {
            status: {
              code: 14,
              highLevelStatus: 'Coletado',
              description: 'A coleta do pacote foi feita e o processo de envio vai ser iniciado.',
              updatedTime: '2024-03-01T10:00:00Z',
            },
            location: { city: 'São Paulo', state: 'SP' },
          },
          {
            status: {
              code: 6,
              highLevelStatus: 'Com problema',
              description:
                'Algo deu errado e o pacote está parado. O remetente precisa resolver o problema.',
              updatedTime: '2024-03-02T12:00:00Z',
            },
            location: { city: 'São Paulo', state: 'SP' },
          },
        ],
      },
    ],
  }
}

describe('loggi transformTracking', () => {
  it('parses every documented history entry with the canonical TrackingEventSchema', () => {
    const events = transformTracking(documentedTracking())
    expect(events).toHaveLength(2)
    for (const e of events) TrackingEventSchema.parse(e)
  })

  it('reads status code, time and location from each entry', () => {
    const [first, second] = transformTracking(documentedTracking())
    expect(first).toMatchObject({
      trackingNumber: 'AM1007503594LG',
      shipmentId: 'AM1007503594LG',
      carrierId: 'loggi',
      status: 'IN_TRANSIT',
      description: 'Coletado',
      location: { city: 'São Paulo', state: 'SP' },
    })
    expect(first.occurredAt?.toISOString()).toBe('2024-03-01T10:00:00.000Z')
    expect(second.status).toBe('FAILURE')
  })

  it('builds a deterministic id from tracking code, status code and time', () => {
    const ids = transformTracking(documentedTracking()).map((e) => e.id)
    expect(ids).toEqual([
      'AM1007503594LG:14:2024-03-01T10:00:00Z',
      'AM1007503594LG:6:2024-03-02T12:00:00Z',
    ])
    expect(transformTracking(documentedTracking()).map((e) => e.id)).toEqual(ids)
  })

  it('never invents occurredAt or an id when updatedTime is missing', () => {
    const raw = documentedTracking()
    raw.packages![0].trackingHistory = [{ status: { code: 5, highLevelStatus: 'Entregue' } }]
    const [e] = transformTracking(raw)
    expect(e.occurredAt).toBeUndefined()
    expect(e.id).toBeUndefined()
    expect(e.status).toBe('DELIVERED')
  })

  it('returns no events for an empty history — the current status is not an event', () => {
    const raw = documentedTracking()
    raw.packages![0].trackingHistory = []
    expect(transformTracking(raw)).toEqual([])
  })

  // Every row of the V2 table at https://docs.api.loggi.com/reference/trackingapi.
  it.each([
    [1, 'Adicionado no sistema', 'PRE_TRANSIT'],
    [2, 'Cancelado', 'UNKNOWN'],
    [3, 'Preparando para transferência', 'IN_TRANSIT'],
    [4, 'Preparando para entrega', 'IN_TRANSIT'],
    [5, 'Entregue', 'DELIVERED'],
    [6, 'Recusado pelo destinatário', 'FAILURE'],
    [7, 'Devolução iniciada', 'RETURN_TO_SENDER'],
    [8, 'Devolvido', 'RETURN_TO_SENDER'],
    [9, 'Extraviado', 'FAILURE'],
    [10, 'Retirar nos correios', 'AVAILABLE_FOR_PICKUP'],
    [11, 'Em rota', 'OUT_FOR_DELIVERY'],
    [12, 'Imprevisto na entrega', 'FAILURE'],
    [13, 'Conferido', 'IN_TRANSIT'],
    [14, 'Coletado', 'IN_TRANSIT'],
    [15, 'Medido e pesado', 'IN_TRANSIT'],
    [16, 'Saiu de uma base', 'IN_TRANSIT'],
    [17, 'Chegou em uma base', 'IN_TRANSIT'],
    [18, 'Destinatário ausente', 'FAILURE'],
    [19, 'Avariado', 'FAILURE'],
    [20, 'Pendência interna', 'UNKNOWN'],
    [21, 'Endereço errado', 'FAILURE'],
    [22, 'Aguardando ação do remetente', 'UNKNOWN'],
    [23, 'Roubado ou furtado', 'FAILURE'],
    [24, 'Aguardando liberação fiscal', 'UNKNOWN'],
    [25, 'Liberado pela fiscalização', 'IN_TRANSIT'],
    [26, 'Dados incorretos ou inválidos', 'UNKNOWN'],
    [27, 'Pacote não integrado', 'UNKNOWN'],
    [28, 'Coleta pendente', 'PRE_TRANSIT'],
    [29, 'Retido pela fiscalização', 'FAILURE'],
    [30, 'Entregue a transportadora', 'IN_TRANSIT'],
    [31, 'Falha na devolução', 'FAILURE'],
  ] as const)('maps V2 status %i (%s) to %s', (code, _label, expected) => {
    const raw = documentedTracking()
    raw.packages![0].trackingHistory = [{ status: { code, updatedTime: '2024-03-01T10:00:00Z' } }]
    const [e] = transformTracking(raw)
    expect(e.status).toBe(expected)
    TrackingEventSchema.parse(e)
  })

  it('maps unlisted status codes to UNKNOWN', () => {
    const raw = documentedTracking()
    raw.packages![0].trackingHistory = [
      { status: { code: 999, updatedTime: '2024-03-01T10:00:00Z' } },
    ]
    expect(transformTracking(raw)[0].status).toBe('UNKNOWN')
  })
})
