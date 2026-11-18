import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

export interface FedExPieceResponse {
  trackingNumber: string
  packageDocuments?: Array<{
    document: string
    documentFormat: string
  }>
  [key: string]: unknown
}

export interface FedExTransactionShipment {
  masterTrackingNumber: string
  serviceType: string
  pieceResponses?: FedExPieceResponse[]
  [key: string]: unknown
}

export interface FedExShipmentResponse {
  output: {
    transactionShipments: FedExTransactionShipment[]
  }
}

function mapShipmentStatus(_serviceType: string | undefined): ShipmentStatus {
  // FedEx shipment creation always returns a newly-created shipment with label
  return 'LABEL_CREATED'
}

export function transformShipment(raw: FedExTransactionShipment): Shipment {
  return {
    id: raw.masterTrackingNumber,
    status: mapShipmentStatus(raw.serviceType),
    trackingNumber: raw.masterTrackingNumber ?? undefined,
    carrierId: 'fedex',
    serviceCode: raw.serviceType ?? undefined,
    labelUrl: undefined, // FedEx returns base64 labels, not URLs
    createdAt: toISODate(new Date().toISOString()),
    metadata: raw as Record<string, unknown>,
  }
}
