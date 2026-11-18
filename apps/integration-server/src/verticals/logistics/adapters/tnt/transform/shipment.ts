import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toDimensions, toISODate } from '../../shared/transform'

// ─── TNT raw types ──────────────────────────────────────────────────────────

export interface TntAddress {
  name: string | null
  addressLine1: string | null
  addressLine2: string | null
  addressLine3: string | null
  city: string | null
  province: string | null
  postcode: string | null
  country: string | null
  phone: string | null
  email: string | null
  companyName: string | null
  [key: string]: unknown
}

export interface TntPiece {
  sequenceNumber: number
  weight: number | null
  length: number | null
  width: number | null
  height: number | null
  [key: string]: unknown
}

export interface TntShipment {
  consignmentNumber: string
  status: string
  sender: TntAddress | null
  receiver: TntAddress | null
  pieces: TntPiece[] | null
  totalWeight: number | null
  weightUnit: string | null
  dimensionUnit: string | null
  service: string | null
  serviceCode: string | null
  reference: string | null
  labelUrl: string | null
  createdDate: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status) {
    case 'CN':
    case 'CREATED':                 return 'PENDING'
    case 'AR':
    case 'DP':
    case 'IN_TRANSIT':              return 'IN_TRANSIT'
    case 'OD':                      return 'OUT_FOR_DELIVERY'
    case 'OK':
    case 'DELIVERED':               return 'DELIVERED'
    case 'RT':
    case 'RETURNED':                return 'RETURNED'
    case 'CANCELLED':               return 'CANCELLED'
    case 'EX':
    case 'EXCEPTION':               return 'EXCEPTION'
    default:                        return 'UNKNOWN'
  }
}

// ─── Address helper ─────────────────────────────────────────────────────────

function transformTntAddress(raw: TntAddress | null): ReturnType<typeof toAddress> {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.companyName,
    street1: raw.addressLine1,
    street2: raw.addressLine2,
    city: raw.city,
    state: raw.province,
    postal_code: raw.postcode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: TntShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'kg') as 'oz' | 'lb' | 'g' | 'kg'
  const dimUnit = (raw.dimensionUnit?.toLowerCase() === 'in' ? 'in' : 'cm') as 'in' | 'cm'
  const firstPiece = raw.pieces?.[0]

  return {
    id: raw.consignmentNumber,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.consignmentNumber ?? undefined,
    carrierId: 'tnt',
    serviceCode: raw.serviceCode ?? raw.service ?? undefined,
    originAddress: transformTntAddress(raw.sender),
    destinationAddress: transformTntAddress(raw.receiver),
    totalWeight: raw.totalWeight != null
      ? toWeight(raw.totalWeight, weightUnit)
      : undefined,
    dimensions: firstPiece?.length != null && firstPiece?.width != null && firstPiece?.height != null
      ? toDimensions(firstPiece.length, firstPiece.width, firstPiece.height, dimUnit)
      : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdDate),
    metadata: raw as Record<string, unknown>,
  }
}
