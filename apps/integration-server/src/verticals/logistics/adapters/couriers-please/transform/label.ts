import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { CouriersPleaseShipment } from './shipment'

/**
 * Couriers Please Label — derived from the shipment object.
 * Couriers Please includes a label_url on the shipment when created.
 */
export function transformLabel(raw: CouriersPleaseShipment): Label {
  return {
    id: raw.id ?? undefined,
    shipmentId: raw.id ?? undefined,
    trackingNumber: raw.tracking_number ?? undefined,
    carrierId: 'couriers-please',
    serviceCode: raw.service_code ?? undefined,
    status: raw.label_url ? 'CREATED' : undefined,
    url: raw.label_url ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
