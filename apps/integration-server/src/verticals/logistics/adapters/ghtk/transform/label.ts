import type { Label } from '../../../schema/label'
import type { GhtkShipmentRaw } from './shipment'
import { toISODate } from '../../shared/transform'

// GHTK's label endpoint (GET /services/label/{tracking}) returns a binary PDF,
// not a JSON document. We derive label metadata from the shipment response instead,
// using the label_url and tracking fields already present on the shipment object.
export function transformLabelFromShipment(raw: GhtkShipmentRaw): Label {
  const id = raw.tracking_number ?? raw.id ?? raw.shipment_id ?? undefined
  return {
    id: id ? String(id) : undefined,
    shipmentId: raw.id ?? raw.shipment_id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'ghtk',
    serviceCode: raw.service_code ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
