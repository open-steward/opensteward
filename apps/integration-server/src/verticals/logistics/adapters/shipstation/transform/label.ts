import type { Label, LabelStatus } from '../../../schema/label'
import { toISODate } from '../../shared/transform'
import type { SSShipment } from './shipment'

function mapLabelStatus(raw: SSShipment): LabelStatus {
  if (raw.voided) return 'VOIDED'
  return 'CREATED'
}

export function transformLabel(raw: SSShipment): Label {
  return {
    id: String(raw.shipmentId),
    shipmentId: String(raw.shipmentId),
    trackingNumber: raw.trackingNumber || undefined,
    carrierId: raw.carrierCode || undefined,
    serviceCode: raw.serviceCode || undefined,
    format: 'PDF',
    status: mapLabelStatus(raw),
    base64: raw.labelData ?? undefined,
    cost: raw.shipmentCost != null
      ? { amount: raw.shipmentCost, currency: 'USD' }
      : undefined,
    voidedAt: raw.voidDate ? toISODate(raw.voidDate) : undefined,
    createdAt: toISODate(raw.createDate),
    metadata: raw as Record<string, unknown>,
  }
}
