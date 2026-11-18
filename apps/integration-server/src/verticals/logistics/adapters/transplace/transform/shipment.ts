import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface TransplaceShipmentResponse {
  id: string
  referenceNumber?: string
  serviceType?: string
  status?: string
  createdAt?: string
  totalWeight?: {
    value?: number
    unit?: string
  }
  [key: string]: unknown
}

export function transformShipment(raw: TransplaceShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.referenceNumber ?? undefined,
    carrierId: 'transplace',
    serviceCode: raw.serviceType ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
