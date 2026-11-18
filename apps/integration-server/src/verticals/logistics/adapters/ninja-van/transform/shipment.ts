import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface NinjaVanShipmentResponse {
  id: string
  trackingId?: string
  serviceType?: string
  status?: string
  createdAt?: string
  [key: string]: unknown
}

export function transformShipment(raw: NinjaVanShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'ninja-van',
    serviceCode: raw.serviceType ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
