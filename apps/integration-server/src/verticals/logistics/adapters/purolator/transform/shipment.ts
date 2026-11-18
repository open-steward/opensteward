import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Purolator raw types ────────────────────────────────────────────────────

export interface PurolatorShipment {
  ShipmentPIN: string
  TrackingPIN?: string | null
  Status?: string | null
  ServiceID?: string | null
  TotalWeight?: number | null
  WeightUnit?: string | null
  SenderInformation?: Record<string, unknown> | null
  ReceiverInformation?: Record<string, unknown> | null
  LabelURL?: string | null
  Reference?: string | null
  CreatedOn?: string | null
  UpdatedOn?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'Created':
    case 'LabelCreated':        return 'LABEL_CREATED'
    case 'InTransit':
    case 'Transit':             return 'IN_TRANSIT'
    case 'OutForDelivery':      return 'OUT_FOR_DELIVERY'
    case 'Delivered':           return 'DELIVERED'
    case 'Exception':           return 'EXCEPTION'
    case 'Returned':            return 'RETURNED'
    case 'Cancelled':
    case 'Voided':              return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: PurolatorShipment): Shipment {
  const weightUnit = (raw.WeightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.ShipmentPIN,
    status: mapShipmentStatus(raw.Status),
    trackingNumber: raw.TrackingPIN ?? raw.ShipmentPIN ?? undefined,
    carrierId: 'purolator',
    serviceCode: raw.ServiceID ?? undefined,
    originAddress: toAddress(raw.SenderInformation),
    destinationAddress: toAddress(raw.ReceiverInformation),
    totalWeight: raw.TotalWeight != null ? toWeight(raw.TotalWeight, weightUnit) : undefined,
    labelUrl: raw.LabelURL ?? undefined,
    reference: raw.Reference ?? undefined,
    createdAt: toISODate(raw.CreatedOn),
    updatedAt: toISODate(raw.UpdatedOn),
    metadata: raw as Record<string, unknown>,
  }
}
