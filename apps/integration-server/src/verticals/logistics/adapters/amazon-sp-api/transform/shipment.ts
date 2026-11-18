import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface SpApiShipment {
  shipmentId: string
  trackingId?: string | null
  status?: string | null
  serviceType?: string | null
  shipFrom?: Record<string, unknown> | null
  shipTo?: Record<string, unknown> | null
  totalWeight?: { value?: number | null; unit?: string | null } | null
  labelUrl?: string | null
  clientReferenceId?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

export function mapSpApiShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Created':
    case 'LabelCreated':
    case 'LabelPurchased':
      return 'LABEL_CREATED'
    case 'Pickup':
    case 'InTransit':
      return 'IN_TRANSIT'
    case 'OutForDelivery':
      return 'OUT_FOR_DELIVERY'
    case 'Delivered':
      return 'DELIVERED'
    case 'Exception':
    case 'Undeliverable':
      return 'EXCEPTION'
    case 'Returned':
      return 'RETURNED'
    case 'Cancelled':
    case 'Voided':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: SpApiShipment): Shipment {
  const unitRaw = raw.totalWeight?.unit?.toLowerCase() ?? 'kg'
  const unit = (['oz', 'lb', 'g', 'kg'].includes(unitRaw) ? unitRaw : 'kg') as
    | 'oz'
    | 'lb'
    | 'g'
    | 'kg'

  return {
    id: raw.shipmentId,
    status: mapSpApiShipmentStatus(raw.status),
    trackingNumber: raw.trackingId ?? undefined,
    carrierId: 'amazon-sp-api',
    serviceCode: raw.serviceType ?? undefined,
    originAddress: toAddress(raw.shipFrom ?? null),
    destinationAddress: toAddress(raw.shipTo ?? null),
    totalWeight:
      raw.totalWeight?.value != null ? toWeight(raw.totalWeight.value, unit) : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.clientReferenceId ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
