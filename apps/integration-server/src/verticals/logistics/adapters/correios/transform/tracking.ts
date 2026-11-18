import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Correios raw types ─────────────────────────────────────────────────────

export interface CorreiosEvento {
  tipo: string
  status: string
  dtHrCriado: string
  descricao: string | null
  unidade: CorreiosUnidade | null
  unidadeDestino: CorreiosUnidade | null
  [key: string]: unknown
}

export interface CorreiosUnidade {
  nome: string | null
  endereco: CorreiosEndereco | null
  tipo: string | null
  [key: string]: unknown
}

export interface CorreiosEndereco {
  cidade: string | null
  uf: string | null
  cep: string | null
  pais: string | null
  [key: string]: unknown
}

export interface CorreiosObjeto {
  codObjeto: string
  tipoPostal: CorreiosTipoPostal | null
  eventos: CorreiosEvento[]
  [key: string]: unknown
}

export interface CorreiosTipoPostal {
  sigla: string | null
  descricao: string | null
  [key: string]: unknown
}

export interface CorreiosTrackingResponse {
  objetos: CorreiosObjeto[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapTrackingStatus(tipo: string): TrackingEventStatus {
  switch (tipo) {
    case 'BDE':  return 'DELIVERED'
    case 'BDI':  return 'FAILURE'
    case 'BDR':  return 'RETURN_TO_SENDER'
    case 'DO':   return 'IN_TRANSIT'
    case 'OEC':  return 'OUT_FOR_DELIVERY'
    case 'RO':   return 'IN_TRANSIT'
    case 'PAR':  return 'PRE_TRANSIT'
    default:     return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformTracking(raw: CorreiosTrackingResponse, trackingCode: string): TrackingEvent[] {
  const events: TrackingEvent[] = []

  for (const objeto of raw.objetos ?? []) {
    for (const evt of objeto.eventos ?? []) {
      const endereco = evt.unidade?.endereco
      events.push({
        trackingNumber: objeto.codObjeto || trackingCode,
        carrierId: 'correios',
        status: mapTrackingStatus(evt.tipo),
        description: evt.descricao || undefined,
        location: endereco?.cidade
          ? {
              city: endereco.cidade,
              state: endereco.uf ?? undefined,
              postalCode: endereco.cep ?? undefined,
              country: endereco.pais ?? 'BR',
            }
          : undefined,
        occurredAt: toISODate(evt.dtHrCriado),
        metadata: evt as Record<string, unknown>,
      })
    }
  }

  if (events.length === 0) {
    events.push({
      trackingNumber: trackingCode,
      carrierId: 'correios',
      status: 'UNKNOWN',
      metadata: raw as Record<string, unknown>,
    })
  }

  return events
}
