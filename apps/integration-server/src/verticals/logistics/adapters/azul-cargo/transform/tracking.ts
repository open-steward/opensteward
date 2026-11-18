import type { TrackingEvent } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

/**
 * One occurrence from POST /api/Rastreio/Consultar.
 *
 * https://ediapi.onlineapp.com.br/toolkit/swagger/docs/v1
 *   "Online.NotaFiscal.Core.Ferramentas.Integradores.WEBCARGO_JSON_Rastreio_Ocorrencia":
 *   {"type":"object","properties":{"Codigo":{"type":"string"},"Comentario":{"type":"string"},
 *   "DataHora":{"format":"date-time","type":"string"},"Descricao":{"type":"string"},
 *   "Unidade":{"type":"string"},"UnidadeMunicipio":{"type":"string"},
 *   "UnidadeUF":{"type":"string"},"Usuario":{"type":"string"},
 *   "Volumes":{"format":"int32","type":"integer"}}}
 */
export interface AzulCargoOcorrencia {
  Codigo?: string | null
  Comentario?: string | null
  DataHora?: string | null
  Descricao?: string | null
  Unidade?: string | null
  UnidadeMunicipio?: string | null
  UnidadeUF?: string | null
  Usuario?: string | null
  Volumes?: number | null
}

/**
 * The documented 200 body: {"type":"array","items":{"type":"array","items":
 * {"$ref":"#/definitions/...WEBCARGO_JSON_Rastreio_Ocorrencia"}}}.
 */
export type AzulCargoRastreio = AzulCargoOcorrencia[][]

function toLocation(o: AzulCargoOcorrencia): Address | undefined {
  // The spec gives the unit's municipality and UF; it names no country.
  if (!o.UnidadeMunicipio && !o.UnidadeUF) return undefined
  return {
    city: o.UnidadeMunicipio ?? undefined,
    state: o.UnidadeUF ?? undefined,
  }
}

/**
 * Map the occurrences for one AWB to canonical events. The response carries
 * no tracking number, so it comes from the AWB the caller asked for. The spec
 * documents no enumeration of `Codigo`, so status is UNKNOWN; the code and
 * description travel on the event.
 */
export function transformTracking(awb: string, raw: AzulCargoRastreio): TrackingEvent[] {
  return raw.flat().map((o) => ({
    trackingNumber: awb,
    status: 'UNKNOWN',
    description: o.Descricao ?? undefined,
    location: toLocation(o),
    occurredAt: toISODate(o.DataHora),
    metadata: o as Record<string, unknown>,
  }))
}
