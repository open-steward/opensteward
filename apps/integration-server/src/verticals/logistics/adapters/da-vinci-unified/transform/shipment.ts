import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface DaVinciShipment {
  ShipmentId?: string | number | null
  ShipmentKey?: string | null
  TrackingNumber?: string | null
  Status?: string | null
  CarrierCode?: string | null
  ServiceCode?: string | null
  Weight?: number | null
  WeightUOM?: string | null
  WarehouseId?: string | number | null
  ShipFromAddress?: Record<string, unknown> | null
  ShipToAddress?: Record<string, unknown> | null
  LabelURL?: string | null
  Reference?: string | null
  OrderId?: string | number | null
  EstimatedDeliveryDate?: string | null
  ActualDeliveryDate?: string | null
  ShipDate?: string | null
  CreatedDate?: string | null
  ModifiedDate?: string | null
  [key: string]: unknown
}

function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Pending':
    case 'New':
      return 'PENDING'
    case 'LabelCreated':
    case 'Label Created':
    case 'ReadyToShip':
      return 'LABEL_CREATED'
    case 'Shipped':
    case 'InTransit':
    case 'In Transit':
      return 'IN_TRANSIT'
    case 'OutForDelivery':
    case 'Out for Delivery':
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'Exception':
    case 'Error':
      return 'EXCEPTION'
    case 'Returned':
    case 'ReturnToSender':
      return 'RETURNED'
    case 'Cancelled':
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: DaVinciShipment): Shipment {
  const id = raw.ShipmentId != null ? String(raw.ShipmentId) : (raw.ShipmentKey ?? undefined)
  const weightUnit = (raw.WeightUOM?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id,
    status: mapStatus(raw.Status),
    trackingNumber: raw.TrackingNumber ?? undefined,
    carrierId: raw.CarrierCode ?? 'da-vinci-unified',
    serviceCode: raw.ServiceCode ?? undefined,
    warehouseId: raw.WarehouseId != null ? String(raw.WarehouseId) : undefined,
    originAddress: toAddress(raw.ShipFromAddress),
    destinationAddress: toAddress(raw.ShipToAddress),
    totalWeight: raw.Weight != null ? toWeight(raw.Weight, weightUnit) : undefined,
    labelUrl: raw.LabelURL ?? undefined,
    reference: raw.Reference ?? undefined,
    estimatedDeliveryAt: toISODate(raw.EstimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.ActualDeliveryDate),
    createdAt: toISODate(raw.CreatedDate),
    updatedAt: toISODate(raw.ModifiedDate),
    metadata: raw as Record<string, unknown>,
  }
}
