import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface ConvoyShipmentResponse {
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

export function transformShipment(raw: ConvoyShipmentResponse): Shipment {
  return {
    id: raw.id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.referenceNumber ?? undefined,
    carrierId: 'convoy',
    serviceCode: raw.serviceType ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
