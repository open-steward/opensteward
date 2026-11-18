import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

// ─── Estes raw types ────────────────────────────────────────────────────────

export interface EstesAddress {
  name: string | null
  company: string | null
  addressLine1: string | null
  addressLine2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  email: string | null
  [key: string]: unknown
}

export interface EstesPickupRequest {
  requestNumber: string
  status: string
  proNumber: string | null
  bolNumber: string | null
  shipper: EstesAddress | null
  consignee: EstesAddress | null
  totalWeight: number | null
  weightUnit: string | null
  totalPieces: number | null
  serviceLevel: string | null
  reference: string | null
  pickupDate: string | null
  createdDate: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status.toUpperCase()) {
    case 'CREATED':
    case 'PENDING':
    case 'SCHEDULED':               return 'PENDING'
    case 'PICKED_UP':
    case 'IN_TRANSIT':              return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':        return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':               return 'DELIVERED'
    case 'RETURNED':                return 'RETURNED'
    case 'CANCELLED':               return 'CANCELLED'
    case 'EXCEPTION':               return 'EXCEPTION'
    default:                        return 'UNKNOWN'
  }
}

// ─── Address helper ─────────────────────────────────────────────────────────

function transformEstesAddress(raw: EstesAddress | null): ReturnType<typeof toAddress> {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.addressLine1,
    street2: raw.addressLine2,
    city: raw.city,
    state: raw.state,
    postal_code: raw.postalCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: EstesPickupRequest): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.requestNumber,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.proNumber ?? undefined,
    carrierId: 'estes',
    serviceCode: raw.serviceLevel ?? undefined,
    originAddress: transformEstesAddress(raw.shipper),
    destinationAddress: transformEstesAddress(raw.consignee),
    totalWeight: raw.totalWeight != null
      ? toWeight(raw.totalWeight, weightUnit)
      : undefined,
    reference: raw.bolNumber ?? raw.reference ?? undefined,
    notes: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdDate),
    metadata: raw as Record<string, unknown>,
  }
}
