import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface NZPostShipmentResponse {
  parcelId: string
  trackingNumber?: string
  serviceCode?: string
  status?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformShipment(raw: NZPostShipmentResponse): Shipment {
  return {
    id: raw.parcelId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'nzpost',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
