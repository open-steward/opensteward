import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { SingaporePostShipment } from './shipment'

// ─── Transform (derived from shipment) ──────────────────────────────────────
//
// Singapore Post does not expose a dedicated /labels endpoint. Labels are
// created inline during shipment creation; the shipment response carries
// label_url, tracking_number, and service_code — enough to populate the
// canonical Label shape.

export function transformLabel(raw: SingaporePostShipment): Label {
  return {
    id: raw.shipment_id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'singapore-post',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
