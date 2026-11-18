import type { Label } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { TerminalAfricaShipment } from './shipment'

export function transformLabel(
  raw: TerminalAfricaShipment,
  labelUrl: string,
): Label {
  return {
    id: raw.shipment_id ?? raw.id ?? undefined,
    shipmentId: raw.shipment_id ?? raw.id ?? undefined,
    trackingNumber:
      raw.carrier_tracking_number ?? raw.tracking_number ?? raw.extras?.tracking_number ?? undefined,
    carrierId: raw.carrier_slug ?? raw.carrier ?? undefined,
    format: 'PDF',
    status: 'CREATED',
    url: labelUrl,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
