import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ZtoExpressOrder } from './shipment'

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformLabel(raw: ZtoExpressOrder): Label {
  return {
    id: raw.order_id,
    shipmentId: raw.order_id,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'zto-express',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
