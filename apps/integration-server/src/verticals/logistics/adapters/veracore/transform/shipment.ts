import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

/**
 * Raw VeraCore shipment as returned by GET /v1/shipments/{id} or listed in
 * GET /v1/shipments.
 */
export interface VeraCoreShipment {
  ShipmentID: string | number
  TrackingNumber?: string | null
  Status?: string | null
  CarrierCode?: string | null
  CarrierName?: string | null
  ServiceCode?: string | null
  ServiceName?: string | null
  WarehouseID?: string | number | null
  Weight?: number | null
  WeightUnit?: string | null
  ShipFromAddress?: Record<string, unknown> | null
  ShipToAddress?: Record<string, unknown> | null
  LabelUrl?: string | null
  Reference?: string | null
  OrderID?: string | number | null
  EstimatedDeliveryDate?: string | null
  ActualDeliveryDate?: string | null
  ShipDate?: string | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

export interface VeraCoreShipmentListResponse {
  Shipments?: VeraCoreShipment[]
  TotalCount?: number | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Pending':
    case 'Created':
      return 'PENDING'
    case 'Label Created':
    case 'LabelCreated':
      return 'LABEL_CREATED'
    case 'Shipped':
    case 'In Transit':
    case 'InTransit':
      return 'IN_TRANSIT'
    case 'Out for Delivery':
    case 'OutForDelivery':
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'Exception':
    case 'Error':
      return 'EXCEPTION'
    case 'Returned':
    case 'Return to Sender':
      return 'RETURNED'
    case 'Cancelled':
    case 'Canceled':
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: VeraCoreShipment): Shipment {
  const weightUnit = (raw.WeightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: String(raw.ShipmentID),
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CarrierCode ?? raw.CarrierName ?? 'veracore',
    serviceCode: raw.ServiceCode ?? raw.ServiceName ?? undefined,
    warehouseId: raw.WarehouseID != null ? String(raw.WarehouseID) : undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    totalWeight: raw.Weight != null ? toWeight(raw.Weight, weightUnit) : undefined,
    labelUrl: raw.LabelUrl ?? undefined,
    reference: raw.Reference ?? (raw.OrderID != null ? String(raw.OrderID) : undefined),
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.ActualDeliveryDate),
    createdAt: toISODate(raw.ShipDate ?? raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
