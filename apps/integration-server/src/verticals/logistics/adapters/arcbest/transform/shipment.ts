import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toWeight, toISODate } from '../../shared/transform'

export interface ArcbestAddress {
  name: string | null
  company: string | null
  address1: string | null
  address2: string | null
  city: string | null
  state: string | null
  postalCode: string | null
  country: string | null
  phone: string | null
  email: string | null
  [key: string]: unknown
}

export interface ArcbestShipment {
  requestId: string
  status: string
  proNumber: string | null
  bolNumber: string | null
  shipper: ArcbestAddress | null
  consignee: ArcbestAddress | null
  totalWeight: number | null
  weightUnit: string | null
  serviceLevel: string | null
  reference: string | null
  pickupDate: string | null
  createdDate: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string): ShipmentStatus {
  switch ((status ?? '').toUpperCase()) {
    case 'CREATED':
    case 'PENDING':
    case 'SCHEDULED':
      return 'PENDING'
    case 'PICKED_UP':
    case 'IN_TRANSIT':
      return 'IN_TRANSIT'
    case 'OUT_FOR_DELIVERY':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'RETURNED':
      return 'RETURNED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'EXCEPTION':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

function transformArcbestAddress(raw: ArcbestAddress | null) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.address1,
    street2: raw.address2,
    city: raw.city,
    state: raw.state,
    postal_code: raw.postalCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

export function transformShipment(raw: ArcbestShipment): Shipment {
  const weightUnit = (raw.weightUnit?.toLowerCase() ?? 'lb') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.requestId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.proNumber ?? undefined,
    carrierId: 'arcbest',
    serviceCode: raw.serviceLevel ?? undefined,
    originAddress: transformArcbestAddress(raw.shipper),
    destinationAddress: transformArcbestAddress(raw.consignee),
    totalWeight: raw.totalWeight != null ? toWeight(raw.totalWeight, weightUnit) : undefined,
    reference: raw.bolNumber ?? raw.reference ?? undefined,
    notes: raw.reference ?? undefined,
    createdAt: toISODate(raw.createdDate),
    metadata: raw as Record<string, unknown>,
  }
}
