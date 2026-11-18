import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'
import type { LoggiPackageStatus } from './package'

/**
 * `v1TrackPackageTrackingCodeResponse`, the 200 body of
 *   GET /v1/companies/{company_id}/packages/{tracking_code}/tracking
 * (https://docs.api.loggi.com/reference/trackpackagetrackingcode).
 *
 * `packages[].trackingHistory` is "Histórico de status de um pacote."; each
 * entry carries a `status` (same object as the package's current status) and a
 * `location` ("Objeto que representa a localização do pacote em um dado status.").
 */
export interface LoggiTrackingHistoryEntry {
  status?: LoggiPackageStatus | null
  location?: { city?: string | null; state?: string | null } | null
  [key: string]: unknown
}

export interface LoggiTrackedPackage {
  loggiKey?: string | null
  trackingCode?: string | null
  trackingHistory?: LoggiTrackingHistoryEntry[] | null
  [key: string]: unknown
}

export interface LoggiTrackingResponse {
  packages?: LoggiTrackedPackage[] | null
}

/** V2 status table, https://docs.api.loggi.com/reference/trackingapi. */
const TRACKING_STATUS_BY_CODE: Record<number, TrackingEventStatus> = {
  1: 'PRE_TRANSIT', // Adicionado no sistema
  3: 'IN_TRANSIT', // Preparando para transferência
  4: 'IN_TRANSIT', // Preparando para entrega
  5: 'DELIVERED', // Entregue
  6: 'FAILURE', // Recusado pelo destinatário
  7: 'RETURN_TO_SENDER', // Devolução iniciada
  8: 'RETURN_TO_SENDER', // Devolvido
  9: 'FAILURE', // Extraviado
  10: 'AVAILABLE_FOR_PICKUP', // Retirar nos correios
  11: 'OUT_FOR_DELIVERY', // Em rota
  12: 'FAILURE', // Imprevisto na entrega
  13: 'IN_TRANSIT', // Conferido
  14: 'IN_TRANSIT', // Coletado
  15: 'IN_TRANSIT', // Medido e pesado
  16: 'IN_TRANSIT', // Saiu de uma base
  17: 'IN_TRANSIT', // Chegou em uma base
  18: 'FAILURE', // Destinatário ausente
  19: 'FAILURE', // Avariado
  21: 'FAILURE', // Endereço errado
  23: 'FAILURE', // Roubado ou furtado
  25: 'IN_TRANSIT', // Liberado pela fiscalização
  28: 'PRE_TRANSIT', // Coleta pendente
  29: 'FAILURE', // Retido pela fiscalização
  30: 'IN_TRANSIT', // Entregue a transportadora
  31: 'FAILURE', // Falha na devolução
}

function mapTrackingStatus(code: number | null | undefined): TrackingEventStatus {
  if (code == null) return 'UNKNOWN'
  return TRACKING_STATUS_BY_CODE[code] ?? 'UNKNOWN'
}

function toLocation(loc: LoggiTrackingHistoryEntry['location']): Address | undefined {
  if (!loc?.city && !loc?.state) return undefined
  return { city: loc.city || undefined, state: loc.state || undefined }
}

/**
 * One TrackingEvent per `trackingHistory` entry, in the order Loggi returns
 * them. No event is synthesised from the package's current status: that is
 * not history. The id is built from the tracking code, the status code and
 * the time the package entered that status, so it is stable across reads.
 */
export function transformTracking(raw: LoggiTrackingResponse): TrackingEvent[] {
  const events: TrackingEvent[] = []
  for (const pkg of raw.packages ?? []) {
    const code = pkg.trackingCode ?? undefined
    for (const entry of pkg.trackingHistory ?? []) {
      const status = entry.status
      const at = status?.updatedTime ?? undefined
      events.push({
        id: code && status?.code != null && at ? `${code}:${status.code}:${at}` : undefined,
        shipmentId: code,
        trackingNumber: code,
        carrierId: 'loggi',
        status: mapTrackingStatus(status?.code),
        description: status?.highLevelStatus ?? undefined,
        location: toLocation(entry.location),
        occurredAt: toISODate(at),
        metadata: entry as Record<string, unknown>,
      })
    }
  }
  return events
}
