import type { Shipment } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface PitneyBowesParcelDocument {
  type: string
  contents: string
  contentType: string
  [key: string]: unknown
}

export interface PitneyBowesShipmentResponse {
  shipmentId: string
  parcelTrackingNumber?: string
  parcel?: {
    weight?: { weight?: number; unitOfMeasurement?: string }
    [key: string]: unknown
  }
  rates?: Array<{
    carrier?: string
    serviceId?: string
    [key: string]: unknown
  }>
  documents?: PitneyBowesParcelDocument[]
  [key: string]: unknown
}

export function transformShipment(raw: PitneyBowesShipmentResponse): Shipment {
  return {
    id: raw.shipmentId,
    status: 'LABEL_CREATED',
    trackingNumber: raw.parcelTrackingNumber ?? undefined,
    carrierId: 'pitney-bowes',
    serviceCode: raw.rates?.[0]?.serviceId ?? undefined,
    labelUrl: undefined,
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
