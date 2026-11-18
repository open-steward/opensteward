import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { TntShipment } from './shipment'

/**
 * TNT label transform.
 *
 * TNT does not expose a standalone label management endpoint. Labels are
 * generated when a shipment is created and the URL is embedded in the
 * shipment response as `labelUrl`. We synthesise a canonical Label from the
 * shipment record.
 */
export function transformShipmentToLabel(raw: TntShipment): Label {
  const status: LabelStatus = raw.labelUrl ? 'CREATED' : 'CREATED'
  return {
    id: raw.consignmentNumber ?? undefined,
    shipmentId: raw.consignmentNumber ?? undefined,
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'tnt',
    serviceCode: raw.serviceCode ?? raw.service ?? undefined,
    status,
    url: raw.labelUrl ?? undefined,
    createdAt: toISODate(raw.createdDate),
    metadata: raw as Record<string, unknown>,
  }
}
