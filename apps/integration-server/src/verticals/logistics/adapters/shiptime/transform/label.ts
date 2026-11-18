import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { ShipTimeShipment } from './shipment'

// ─── Transform ──────────────────────────────────────────────────────────────
//
// ShipTime does not expose a dedicated /labels endpoint.  A label is created
// as a side-effect of POST /shipments and its URL is embedded in the shipment
// response body as `label_url`.  This transform derives a Label record from
// the ShipTimeShipment raw type.
//

export function transformLabel(raw: ShipTimeShipment): Label {
  return {
    id: raw.shipment_id ?? undefined,
    shipmentId: raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'shiptime',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
