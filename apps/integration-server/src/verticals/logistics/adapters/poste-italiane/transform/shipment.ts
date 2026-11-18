import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Poste Italiane raw types ──────────────────────────────────────────────

export interface PosteItalianeShipmentResponse {
  shipmentId: string
  barcode?: string
  serviceCode?: string
  status?: string
  createdAt?: string
  labelData?: string
  [key: string]: unknown
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: PosteItalianeShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.barcode ?? undefined,
    carrierId: 'poste-italiane',
    serviceCode: raw.serviceCode ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(raw.createdAt) ?? toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
