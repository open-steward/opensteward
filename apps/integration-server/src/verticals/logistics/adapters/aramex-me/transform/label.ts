import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Aramex ME raw types ────────────────────────────────────────────────────
//
// Returned by POST Shipping/PrintLabel (JSON/REST binding of
// LabelPrintingResponse).

export interface AramexMeShipmentLabelData {
  /** Hosted PDF URL, e.g. https://ws.aramex.net/content/rpt_cache/<id>.pdf */
  LabelURL: string | null
  /** Base64-encoded label content (RPT/PDF bytes) */
  LabelFileContents: string | null
  [key: string]: unknown
}

export interface AramexMePrintLabelResponse {
  ShipmentNumber: string | null
  ShipmentLabel: AramexMeShipmentLabelData | null
  HasErrors: boolean
  Notifications: unknown[]
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(
  raw: AramexMePrintLabelResponse,
  shipmentId?: string,
  trackingNumber?: string,
): Label {
  const label = raw.ShipmentLabel
  return {
    id: raw.ShipmentNumber ?? undefined,
    shipmentId: shipmentId ?? undefined,
    trackingNumber: trackingNumber ?? raw.ShipmentNumber ?? undefined,
    carrierId: 'aramex-me',
    format: 'PDF',
    status: 'CREATED',
    url: label?.LabelURL ?? undefined,
    base64: label?.LabelFileContents ?? undefined,
    createdAt: toISODate(undefined),
    metadata: raw as Record<string, unknown>,
  }
}
