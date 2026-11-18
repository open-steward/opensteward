import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface RoyalMailShipmentResponse {
  shipmentId: string
  trackingNumber?: string
  serviceCode?: string
  status?: string
  createdAt?: string
  labelData?: string
  [key: string]: unknown
}

export function transformShipment(raw: RoyalMailShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'royalmail',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
