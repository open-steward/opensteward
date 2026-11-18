import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'

// ─── SMSA raw types ────────────────────────────────────────────────────────
//
// SMSA does not expose a dedicated label resource endpoint.  Instead, the
// label PDF URL is returned inline on the shipment record (label_url field).
// This transform projects the shipment shape's label fields into the canonical
// Label type, enabling getLabel(awb) via a GET shipment?awbno={awb} call.

export interface SmsaLabelSource {
  /** AWB / tracking number — used as the label id. */
  awbno: string
  /** Hosted PDF URL for the airway-bill label. */
  label_url: string | null
  service_code: string | null
  created_at: string | null
  updated_at: string | null
  [key: string]: unknown
}

// ─── Transform ─────────────────────────────────────────────────────────────

export function transformLabel(raw: SmsaLabelSource): Label {
  return {
    id: raw.awbno,
    shipmentId: raw.awbno,
    trackingNumber: raw.awbno,
    carrierId: 'smsa',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
