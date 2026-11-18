import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface DhlAfricaShipmentResponse {
  id: string
  trackingNumber?: string
  serviceType?: string
  status?: string
  createdAt?: string
  totalWeight?: {
    value?: number
    unit?: string
  }
  labelUrl?: string
  [key: string]: unknown
}

export function transformShipment(raw: DhlAfricaShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'dhl-africa',
    serviceCode: raw.serviceType ?? undefined,
    labelUrl: raw.labelUrl ?? undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
