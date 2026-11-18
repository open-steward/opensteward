import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Nationex raw types ─────────────────────────────────────────────────────

export interface NationexShipment {
  shipmentId: string
  trackingNumber?: string | null
  status?: string | null
  serviceType?: string | null
  totalWeight?: number | null
  weightUnit?: string | null
  shipper?: Record<string, unknown> | null
  consignee?: Record<string, unknown> | null
  labelUrl?: string | null
  customerReference?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'CREATED':
    case 'LABEL_CREATED':       return 'LABEL_CREATED'
    case 'IN_TRANSIT':
    case 'PICKED_UP':           return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':    return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':           return 'DELIVERED'
    case 'EXCEPTION':           return 'EXCEPTION'
    case 'RETURNED':            return 'RETURNED'
    case 'CANCELLED':
    case 'VOIDED':              return 'CANCELLED'
    default:                    return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: NationexShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: 'nationex',
    serviceCode: raw.serviceType ?? undefined,
    originAddress: toAddress(raw.shipper),
    destinationAddress: toAddress(raw.consignee),
    totalWeight: raw.totalWeight != null ? toWeight(raw.totalWeight, weightUnit) : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.customerReference ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
