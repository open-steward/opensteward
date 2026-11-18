import type { Label } from '../../../schema/label'
import { parseDecimal, toISODate } from '../../shared/transform'
import type { ShipcloudShipment } from './shipment'

/**
 * Derive a canonical Label from a shipcloud shipment response.
 *
 * shipcloud returns label_url at the top level of the shipment object.
 * A label is always PDF format on shipcloud (the API does not expose other formats).
 */
export function transformLabel(raw: ShipcloudShipment): Label {
  return {
    id: raw.id,
    shipmentId: raw.id,
    trackingNumber: raw.carrier_tracking_no ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: raw.label_url ?? undefined,
    cost:
      raw.price != null
        ? {
            amount: Math.round((parseDecimal(raw.price) ?? 0) * 100),
            currency: 'EUR',
          }
        : undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
