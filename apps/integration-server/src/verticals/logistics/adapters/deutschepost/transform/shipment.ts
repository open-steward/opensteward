import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface DeutschePostShipmentResponse {
  shipmentId: string
  trackingNumber?: string
  product?: string
  status?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformShipment(raw: DeutschePostShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'deutschepost',
    serviceCode: raw.product ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
