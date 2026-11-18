import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toAddress } from '../../shared/transform'
import { SHIPMENT_STATUS_MAP } from '../constants'

export interface TrimbleTruckmateAddressRaw {
  name?: string
  company?: string
  address?: string
  address2?: string
  city?: string
  state?: string
  zipCode?: string
  country?: string
  phone?: string
  email?: string
  [key: string]: unknown
}

export interface TrimbleTruckmateWeightRaw {
  value?: number
  unit?: string
  [key: string]: unknown
}

export interface TrimbleTruckmateShipmentResponse {
  id?: string
  shipmentId?: string
  tripId?: string
  referenceNumber?: string
  orderNumber?: string
  status?: string
  serviceType?: string
  serviceCode?: string
  carrierId?: string
  warehouseId?: string
  trackingNumber?: string
  origin?: TrimbleTruckmateAddressRaw
  destination?: TrimbleTruckmateAddressRaw
  totalWeight?: TrimbleTruckmateWeightRaw
  estimatedDeliveryDate?: string
  actualDeliveryDate?: string
  createdAt?: string
  updatedAt?: string
  notes?: string
  reference?: string
  [key: string]: unknown
}

function mapShipmentStatus(raw: string | undefined): ShipmentStatus | undefined {
  if (!raw) return undefined
  return (SHIPMENT_STATUS_MAP[raw.toUpperCase()] as ShipmentStatus) ?? undefined
}

function toTruckmateAddress(
  raw: TrimbleTruckmateAddressRaw | undefined,
) {
  if (!raw) return undefined
  return toAddress({
    name: raw.name,
    company: raw.company,
    street1: raw.address,
    street2: raw.address2,
    city: raw.city,
    state: raw.state,
    postalCode: raw.zipCode,
    country: raw.country,
    phone: raw.phone,
    email: raw.email,
  })
}

export function transformShipment(raw: TrimbleTruckmateShipmentResponse): Shipment {
  const id = raw.shipmentId ?? raw.id ?? raw.tripId ?? undefined
  return {
    id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? raw.referenceNumber ?? undefined,
    carrierId: raw.carrierId ?? 'trimble-truckmate',
    serviceCode: raw.serviceCode ?? raw.serviceType ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: toTruckmateAddress(raw.origin),
    destinationAddress: toTruckmateAddress(raw.destination),
    totalWeight: raw.totalWeight?.value != null
      ? {
          value: raw.totalWeight.value,
          unit: (raw.totalWeight.unit?.toLowerCase() === 'kg' ? 'kg' : 'lb') as 'kg' | 'lb',
        }
      : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.actualDeliveryDate),
    reference: raw.reference ?? raw.orderNumber ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    mode: 'ftl',
    metadata: raw as Record<string, unknown>,
  }
}
