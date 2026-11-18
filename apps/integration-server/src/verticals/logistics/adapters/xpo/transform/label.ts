import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── XPO raw types ───────────────────────────────────────────────────────────
//
// Source: XPO LTL Bill of Lading API
// Endpoint: POST /billoflading/1.0/billsoflading (create BOL with shipping labels)
// The BOL creation response includes label content (base64 PDF) and the
// imaging API (GET /imaging/1.0/shipments/{proNumber}/labels) returns a
// hosted URL for the label document.

export interface XpoLabelImage {
  /** Base64-encoded label content (PDF). */
  label?: string | null
  /** Label format: "PDF", "ZPL", etc. */
  format?: string | null
  [key: string]: unknown
}

export interface XpoBolLabelResponse {
  /** PRO number — the canonical tracking number for the shipment. */
  proNbr?: string | null
  proNumber?: string | null
  /** BOL document identifier. */
  bolInstId?: string | null
  bolNumber?: string | null
  /** Date the BOL was created / pickup was requested. */
  createdDate?: string | null
  pickupDate?: string | null
  /** Hosted URL for the shipping label PDF (from imaging API). */
  labelUrl?: string | null
  /** Embedded label images returned inline with the BOL. */
  images?: {
    shippingLabels?: XpoLabelImage[]
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ─── Transform ───────────────────────────────────────────────────────────────

export function transformLabel(raw: XpoBolLabelResponse, index = 0): Label {
  const proNumber = raw.proNbr ?? raw.proNumber ?? undefined
  const img = raw.images?.shippingLabels?.[index] ?? null
  const rawFormat = (img?.format ?? 'PDF').toUpperCase()
  const format =
    rawFormat === 'PDF' || rawFormat === 'ZPL' || rawFormat === 'PNG' || rawFormat === 'EPL2'
      ? (rawFormat as 'PDF' | 'ZPL' | 'PNG' | 'EPL2')
      : ('PDF' as const)

  return {
    id: raw.bolInstId ?? raw.bolNumber ?? proNumber,
    shipmentId: raw.bolInstId ?? undefined,
    trackingNumber: proNumber,
    carrierId: 'xpo',
    format,
    status: 'CREATED',
    url: raw.labelUrl ?? undefined,
    base64: img?.label ?? undefined,
    createdAt: toISODate(raw.createdDate ?? raw.pickupDate),
    metadata: raw as Record<string, unknown>,
  }
}
