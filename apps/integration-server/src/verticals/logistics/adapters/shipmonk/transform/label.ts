/**
 * ShipMonk Label → canonical Label.
 *
 * ShipMonk has no dedicated label endpoint; label data is derived from
 * the shipment response where `label_url` is embedded on the shipment object.
 * See: GET /v1/shipments/:id (label_url field on ShipmonkShipment).
 */
import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ShipmonkShipment } from './shipment'

export function transformLabel(raw: ShipmonkShipment): Label {
  return {
    id: raw.id,
    shipmentId: raw.order_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
