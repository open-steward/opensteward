import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface InPostShipmentResponse {
  id: string
  trackingNumber?: string
  serviceCode?: string
  status?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformShipment(raw: InPostShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'inpost',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
