import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress, toWeight } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

export interface BlueYonderShipmentAddress {
  name?: string
  company?: string
  streetAddress?: string
  streetAddress2?: string
  city?: string
  stateOrProvince?: string
  postalCode?: string
  countryCode?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface BlueYonderShipmentResponse {
  shipmentId: string
  referenceNumber?: string
  serviceCode?: string
  status?: string
  mode?: string
  createdAt?: string
  updatedAt?: string
  estimatedDeliveryDate?: string
  actualDeliveryDate?: string
  trackingNumber?: string
  carrierId?: string
  weight?: {
    value?: number
    unit?: string
  }
  originAddress?: BlueYonderShipmentAddress
  destinationAddress?: BlueYonderShipmentAddress
  [key: string]: unknown
}

function mapShipmentStatus(raw: string | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  return (SHIPMENT_STATUS_MAP[raw.toUpperCase()] as ShipmentStatus) ?? 'UNKNOWN'
}

function byAddress(addr: BlueYonderShipmentAddress | undefined) {
  if (!addr) return undefined
  return toAddress({
    name: addr.name,
    company: addr.company,
    street1: addr.streetAddress,
    street2: addr.streetAddress2,
    city: addr.city,
    state: addr.stateOrProvince,
    postalCode: addr.postalCode,
    country: addr.countryCode,
    phone: addr.phone,
    email: addr.email,
  })
}

export function transformShipment(raw: BlueYonderShipmentResponse): Shipment {
  const weightUnit =
    raw.weight?.unit === 'KG' || raw.weight?.unit === 'kg' ? ('kg' as const) : ('lb' as const)

  return {
    id: raw.shipmentId,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? raw.referenceNumber ?? undefined,
    carrierId: raw.carrierId ?? 'blue-yonder',
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: byAddress(raw.originAddress),
    destinationAddress: byAddress(raw.destinationAddress),
    totalWeight: toWeight(raw.weight?.value, weightUnit),
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
