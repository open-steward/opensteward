import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { JanioOrder } from './shipment'

// ─── Status mapping ──────────────────────────────────────────────────────────
// Janio orders that have a label_url are considered CREATED; cancelled orders VOIDED.

function mapLabelStatus(status: string | null): LabelStatus {
  switch (status) {
    case 'CANCELLED': return 'VOIDED'
    default:          return 'CREATED'
  }
}

// ─── Transform ───────────────────────────────────────────────────────────────
// Janio does not expose a dedicated /labels endpoint.  The label URL is embedded
// in every order response as `label_url`.  This transform derives a Label record
// from a JanioOrder.

export function transformLabel(raw: JanioOrder): Label {
  return {
    id: raw.order_id,
    shipmentId: raw.order_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'janio',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: mapLabelStatus(raw.status),
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
