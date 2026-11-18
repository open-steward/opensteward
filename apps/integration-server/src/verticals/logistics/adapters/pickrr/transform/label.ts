import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { PickrrShipment } from './shipment'

/**
 * Pickrr Label — derived from the PickrrShipment object.
 *
 * Pickrr surfaces a `label_url` field on every shipment returned by the
 * `shipments/` and `shipments/<id>/` endpoints.  There is no separate label
 * endpoint in the public API, so we project the relevant shipment fields to
 * produce a canonical Label record.
 */
export function transformLabel(raw: PickrrShipment): Label {
  return {
    id: String(raw.order_pk ?? raw.tracking_id ?? ''),
    shipmentId: String(raw.order_pk ?? raw.tracking_id ?? ''),
    trackingNumber: raw.tracking_id ?? undefined,
    carrierId: raw.order_service_used ?? undefined,
    format: 'PDF',
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
