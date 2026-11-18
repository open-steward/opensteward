import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface BpostShipmentResponse {
  shipmentId: string
  barcode?: string
  serviceCode?: string
  status?: string
  createdAt?: string
  labelData?: string
  [key: string]: unknown
}

export function transformShipment(raw: BpostShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'bpost',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
