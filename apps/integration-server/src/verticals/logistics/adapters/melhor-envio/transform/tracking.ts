import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Melhor Envio raw types ───────────────────────────────────────────────────

export interface MelhorEnvioTrackingEvent {
  status?: string | null
  message?: string | null
  description?: string | null
  created_at?: string | null
  location?: string | null
  city?: string | null
  state?: string | null
  zip?: string | null
  [key: string]: unknown
}

export interface MelhorEnvioTrackingResponse {
  id?: string | number | null
  tracking?: string | null
  status?: string | null
  events?: MelhorEnvioTrackingEvent[] | null
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toUpperCase()
  if (
    v.includes('PRE') ||
    v === 'CREATED' ||
    v === 'GERADO' ||
    v === 'GENERATED' ||
    v === 'POSTADO' ||
    v === 'POSTED' ||
    v === 'LABEL_CREATED' ||
    v === 'PAID' ||
    v === 'PAGO'
  )
    return 'PRE_TRANSIT'
  if (v === 'OUT_FOR_DELIVERY' || v === 'SAIU_PARA_ENTREGA' || v.includes('OUT FOR DELIVERY'))
    return 'OUT_FOR_DELIVERY'
  if (v === 'DELIVERED' || v === 'ENTREGUE' || v.includes('DELIVERED')) return 'DELIVERED'
  if (
    v.includes('PICKUP') ||
    v.includes('RETIRADA') ||
    v === 'AVAILABLE_FOR_PICKUP'
  )
    return 'AVAILABLE_FOR_PICKUP'
  if (v.includes('RETURN') || v.includes('DEVOL')) return 'RETURN_TO_SENDER'
  if (
    v.includes('FAIL') ||
    v.includes('EXCEPTION') ||
    v.includes('PROBLEMA') ||
    v.includes('ERROR') ||
    v === 'REFUSED' ||
    v === 'RECUSADO'
  )
    return 'FAILURE'
  if (
    v.includes('TRANSIT') ||
    v.includes('TRANSITO') ||
    v === 'IN_TRANSIT' ||
    v === 'EM_TRANSITO'
  )
    return 'IN_TRANSIT'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTracking(raw: MelhorEnvioTrackingResponse): TrackingEvent[] {
  const shipmentId = raw.id != null ? String(raw.id) : undefined
  const trackingNumber = raw.tracking ?? undefined

  const events = raw.events ?? []

  if (events.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId: 'melhor-envio',
        status: mapTrackingStatus(raw.status ?? null),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return events.map((evt) => ({
    shipmentId,
    trackingNumber,
    carrierId: 'melhor-envio',
    status: mapTrackingStatus(evt.status ?? null),
    description: evt.description ?? evt.message ?? undefined,
    location:
      evt.city || evt.state
        ? {
            city: evt.city ?? undefined,
            state: evt.state ?? undefined,
            postalCode: evt.zip ?? undefined,
          }
        : undefined,
    occurredAt: toISODate(evt.created_at),
    metadata: evt as Record<string, unknown>,
  }))
}
