import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

export interface InnoshipTrackHistory {
  clientStatusId?: number | null
  clientStatusDescription?: string | null
  eventDate?: string | null
  isFinalStatus?: boolean | null
  localityName?: string | null
  [key: string]: unknown
}

export interface InnoshipTrackResult {
  orderId?: number | null
  externalOrderId?: string | null
  correlationId?: string | null
  courier?: number | null
  shipmentAwb?: string | null
  trackingNumber?: string | null
  recipientContactName?: string | null
  recipientLocality?: string | null
  recipientCountryCode?: string | null
  trackUrl?: string | null
  currentStatus?: string | null
  currentStatusId?: number | null
  history?: InnoshipTrackHistory[] | null
  returnAwbHistory?: InnoshipTrackHistory[] | null
  [key: string]: unknown
}

function mapTrackStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('delivered') || s.includes('livrat')) return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('in_delivery') || s.includes('la livrare')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('transit') || s.includes('picked') || s.includes('expediat')) return 'IN_TRANSIT'
  if (s.includes('pre_transit') || s.includes('awb') || s.includes('created')) return 'PRE_TRANSIT'
  if (s.includes('return') || s.includes('retur')) return 'RETURN_TO_SENDER'
  if (s.includes('pickup') || s.includes('available')) return 'AVAILABLE_FOR_PICKUP'
  if (s.includes('exception') || s.includes('incident') || s.includes('failed')) return 'FAILURE'
  return 'UNKNOWN'
}

function toLocation(localityName: string | null | undefined, countryCode: string | null | undefined): Address | undefined {
  if (!localityName && !countryCode) return undefined
  return {
    city: localityName ?? undefined,
    country: countryCode ?? undefined,
  }
}

export function transformTrackResult(raw: InnoshipTrackResult): TrackingEvent[] {
  const shipmentId = raw.orderId != null ? String(raw.orderId) : undefined
  const trackingNumber = raw.shipmentAwb ?? raw.trackingNumber ?? undefined
  const carrierId = raw.courier != null ? String(raw.courier) : undefined

  const history = raw.history ?? []

  if (history.length === 0) {
    return [
      {
        shipmentId,
        trackingNumber,
        carrierId,
        status: mapTrackStatus(raw.currentStatus),
        location: toLocation(raw.recipientLocality, raw.recipientCountryCode),
        metadata: raw as Record<string, unknown>,
      },
    ]
  }

  return history.map((h) => ({
    shipmentId,
    trackingNumber,
    carrierId,
    status: mapTrackStatus(h.clientStatusDescription),
    description: h.clientStatusDescription ?? undefined,
    location: toLocation(h.localityName ?? raw.recipientLocality, raw.recipientCountryCode),
    occurredAt: toISODate(h.eventDate),
    metadata: h as Record<string, unknown>,
  }))
}
