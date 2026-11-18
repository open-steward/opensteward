import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Aramex raw types ───────────────────────────────────────────────────────

export interface AramexShipmentLabel {
  LabelURL: string | null
  LabelFileContents: string | null
  ReportID: string | null
  ReportType: string | null
  [key: string]: unknown
}

export interface AramexPrintLabelResponse {
  ShipmentNumber: string | null
  ShipmentLabel: AramexShipmentLabel | null
  HasErrors: boolean
  Notifications: unknown[]
  Transaction: {
    Reference1: string | null
    [key: string]: unknown
  } | null
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: AramexPrintLabelResponse, requestedAt?: Date): Label {
  const lbl = raw.ShipmentLabel

  return {
    id: raw.ShipmentNumber ?? undefined,
    shipmentId: raw.ShipmentNumber ?? undefined,
    trackingNumber: raw.ShipmentNumber ?? undefined,
    carrierId: 'aramex',
    status: 'CREATED',
    url: lbl?.LabelURL ?? undefined,
    base64: lbl?.LabelFileContents ?? undefined,
    createdAt: requestedAt ?? toISODate(undefined),
    metadata: raw as Record<string, unknown>,
  }
}
