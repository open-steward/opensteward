import type { TrackingEvent, TrackingEventStatus } from '../../../schema/trackingevent'
import { toISODate } from '../../shared/transform'

// ─── Webshipper raw types ────────────────────────────────────────────────────

export interface WebshipperTrackingEventAttributes {
  status?: string | null
  description?: string | null
  event_time?: string | null
  location?: string | null
  tracking_number?: string | null
  shipment_id?: string | number | null
  [key: string]: unknown
}

export interface WebshipperTrackingEvent {
  id?: string | number | null
  type?: string
  attributes?: WebshipperTrackingEventAttributes | null
  [key: string]: unknown
}

export interface WebshipperTrackingListResponse {
  data?: WebshipperTrackingEvent[]
  [key: string]: unknown
}

// ─── Status mapping ──────────────────────────────────────────────────────────

function mapTrackingStatus(status: string | null | undefined): TrackingEventStatus {
  if (!status) return 'UNKNOWN'
  const v = status.toLowerCase()
  if (v.includes('pre') || v === 'label_created' || v === 'created' || v === 'manifested') return 'PRE_TRANSIT'
  if (v === 'out_for_delivery' || v.includes('out_for_delivery')) return 'OUT_FOR_DELIVERY'
  if (v === 'delivered' || v.includes('delivered')) return 'DELIVERED'
  if (v.includes('pickup') || v === 'available_for_pickup') return 'AVAILABLE_FOR_PICKUP'
  if (v.includes('return')) return 'RETURN_TO_SENDER'
  if (v.includes('fail') || v.includes('exception') || v.includes('refused') || v === 'error') return 'FAILURE'
  if (v === 'in_transit' || v.includes('transit') || v.includes('en_route')) return 'IN_TRANSIT'
  return 'UNKNOWN'
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformTrackingEvent(raw: WebshipperTrackingEvent): TrackingEvent {
  const attrs = raw.attributes ?? {}

  return {
    id: String(raw.id ?? ''),
    shipmentId: attrs.shipment_id != null ? String(attrs.shipment_id) : undefined,
    trackingNumber: attrs.tracking_number ?? undefined,
    carrierId: 'webshipper',
    status: mapTrackingStatus(attrs.status),
    description: attrs.description ?? undefined,
    occurredAt: toISODate(attrs.event_time),
    metadata: raw as Record<string, unknown>,
  }
}

export function transformTrackingEvents(response: WebshipperTrackingListResponse): TrackingEvent[] {
  return (response.data ?? []).map(transformTrackingEvent)
}
