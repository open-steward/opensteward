import type { Label, LabelStatus } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'

// ─── StarTrack raw types ─────────────────────────────────────────────────────
// Source: POST /labels — Australia Post Shipping and Tracking API
// The response is an array of label objects, one per shipment.

export interface StartrackLabelItem {
  shipment_id?: string | null
  tracking_details?: {
    article_id?: string | null
    consignment_id?: string | null
    barcode_id?: string | null
  } | null
  label_request_id?: string | null
  status?: string | null
  url?: string | null
  /** Base64-encoded label content returned by some integrations */
  content?: string | null
  /** Cost of the label (amount in dollars) */
  cost?: number | string | null
  currency?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

export interface StartrackLabelResponse {
  labels?: StartrackLabelItem[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null | undefined): LabelStatus {
  if (!status) return 'CREATED'
  const v = status.toUpperCase()
  if (v === 'CREATED' || v === 'PENDING') return 'CREATED'
  if (v === 'USED' || v === 'MANIFESTED') return 'USED'
  if (v === 'REFUNDED') return 'REFUNDED'
  if (v === 'VOIDED' || v === 'CANCELLED' || v === 'CANCELED') return 'VOIDED'
  return 'CREATED'
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: StartrackLabelItem): Label {
  const trackingNumber =
    raw.tracking_details?.article_id ??
    raw.tracking_details?.barcode_id ??
    raw.tracking_details?.consignment_id ??
    undefined

  const costAmount = parseDecimal(raw.cost ?? undefined)

  return {
    id: raw.label_request_id ?? raw.shipment_id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: trackingNumber ?? undefined,
    carrierId: 'startrack',
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.url ?? undefined,
    base64: raw.content ?? undefined,
    cost:
      costAmount !== undefined && raw.currency
        ? { amount: costAmount, currency: raw.currency as string }
        : undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
