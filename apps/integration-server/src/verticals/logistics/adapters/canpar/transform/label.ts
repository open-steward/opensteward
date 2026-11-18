import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { CanparShipment } from './shipment'

/**
 * Canpar Label — derived from the waybill created during shipment.
 * Canpar returns a label_url on the shipment object; there is no
 * separate label endpoint, so we project the shipment fields.
 */
export function transformLabel(raw: CanparShipment): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.id ?? undefined,
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'canpar',
    serviceCode: raw.service_type ?? undefined,
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_date),
    updatedAt: toISODate(raw.updated_date),
    metadata: raw as Record<string, unknown>,
  }
}
