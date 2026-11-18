import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface AusPostShipmentResponse {
  shipment_id: string
  tracking_id?: string
  service_code?: string
  status?: string
  created_date?: string
  [key: string]: unknown
}

export interface AusPostCreateShipmentResponse {
  shipments: AusPostShipmentResponse[]
  [key: string]: unknown
}

export function transformShipment(raw: AusPostShipmentResponse): Shipment {
  return {
    id: raw.shipment_id,
    status: 'LABEL_CREATED',
    trackingNumber: raw.tracking_id ?? undefined,
    carrierId: 'auspost',
    serviceCode: raw.service_code ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.created_date) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
