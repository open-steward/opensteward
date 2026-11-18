import type { Label, LabelFormat } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── Parcelforce raw types ─────────────────────────────────────────────────
//
// Parcelforce's createShipment response includes a label_url and
// label_format field. The platform has no separate label-listing endpoint;
// labels are derived from shipment creation responses.

export interface ParcelforceLabel {
  shipment_id: string
  tracking_number: string | null
  label_url: string | null
  label_format: string | null  // e.g. "PDF", "PNG", "ZPL"
  service_code: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Format mapping ─────────────────────────────────────────────────────────

function mapLabelFormat(format: string | null | undefined): LabelFormat | undefined {
  if (!format) return undefined
  const f = format.toUpperCase()
  if (f === 'PDF')  return 'PDF'
  if (f === 'PNG')  return 'PNG'
  if (f === 'ZPL')  return 'ZPL'
  if (f === 'EPL2') return 'EPL2'
  return undefined
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: ParcelforceLabel): Label {
  return {
    id: raw.shipment_id,
    shipmentId: raw.shipment_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'parcelforce',
    serviceCode: raw.service_code ?? undefined,
    format: mapLabelFormat(raw.label_format),
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
