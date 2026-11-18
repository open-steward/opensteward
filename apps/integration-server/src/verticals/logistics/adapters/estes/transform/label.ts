import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Estes raw types ────────────────────────────────────────────────────────
//
// Labels are returned as part of the POST /v1/bol response when the caller
// sets images.includeShippingLabels = true.  The images object in the
// response contains a base64-encoded PDF (or ZPL) for each shipping label.

export interface EstesLabelImage {
  /** Base64-encoded label content. */
  label: string | null
  /** Format of the label content, e.g. "PDF", "ZPL". */
  format: string | null
  [key: string]: unknown
}

export interface EstesBolResponse {
  /** PRO number assigned by Estes; used as the canonical tracking number. */
  proNumber: string | null
  bolNumber: string | null
  requestedPickupDate: string | null
  images?: {
    shippingLabels?: EstesLabelImage[]
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: EstesBolResponse, index = 0): Label {
  const img = raw.images?.shippingLabels?.[index] ?? null
  const format = img?.format?.toUpperCase()

  return {
    id: raw.bolNumber ?? raw.proNumber ?? undefined,
    shipmentId: raw.proNumber ?? undefined,
    trackingNumber: raw.proNumber ?? undefined,
    carrierId: 'estes',
    format: (format === 'PDF' || format === 'ZPL' || format === 'PNG' || format === 'EPL2')
      ? format
      : undefined,
    status: 'CREATED',
    base64: img?.label ?? undefined,
    createdAt: toISODate(raw.requestedPickupDate),
    metadata: raw as Record<string, unknown>,
  }
}
