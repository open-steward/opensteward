import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { FetchrShipment } from './shipment'

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapLabelStatus(status: string | null): LabelStatus {
  switch (status) {
    case 'CANCELLED':  return 'VOIDED'
    case 'DELIVERED':  return 'USED'
    default:           return 'CREATED'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────
//
// Fetchr does not expose a dedicated /labels endpoint.  Label data
// (label_url, tracking ID, service code) is embedded in the order/shipment
// response returned by POST /orders.  This transform derives the canonical
// Label from that same FetchrShipment object.

export function transformLabel(raw: FetchrShipment): Label {
  return {
    id: raw.orderId,
    shipmentId: raw.orderId,
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'fetchr',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
