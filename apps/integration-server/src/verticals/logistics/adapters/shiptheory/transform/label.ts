import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ShiptheoryShipment } from './shipment'

/**
 * Shiptheory returns labels as base64-encoded PDF strings on the shipment
 * object. There is no separate label resource endpoint.
 */
export function transformShipmentToLabel(raw: ShiptheoryShipment): Label {
  return {
    id: raw.channel_reference_id ?? undefined,
    shipmentId: raw.channel_reference_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service_name ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    base64: raw.label ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
