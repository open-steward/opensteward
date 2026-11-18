import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { BrtShipment } from './shipment'

// ─── BRT raw types ─────────────────────────────────────────────────────────
//
// BRT does not expose a dedicated /labels endpoint.  The label URL is embedded
// in the shipment object returned by POST /shipments.  This transform derives
// a canonical Label record from the BrtShipment response.

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null): LabelStatus {
  switch (status) {
    case 'ANNULLATO': return 'VOIDED'
    case 'CONSEGNATO': return 'USED'
    case 'RESO':       return 'USED'
    default:           return 'CREATED'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: BrtShipment): Label {
  return {
    id: raw.shipment_id,
    shipmentId: raw.shipment_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'brt',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
