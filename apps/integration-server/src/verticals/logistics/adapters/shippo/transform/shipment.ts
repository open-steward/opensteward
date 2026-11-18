import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions } from '../../shared/transform'
import { transformAddress, type ShippoAddress } from './address'
import { type ShippoRate } from './rate'

export interface ShippoParcel {
  object_id: string
  object_created: string
  object_updated: string
  object_owner: string
  object_state: string
  length: string | null
  width: string | null
  height: string | null
  distance_unit: 'cm' | 'in' | 'ft' | 'mm' | 'm' | 'yd'
  weight: string | null
  mass_unit: 'g' | 'oz' | 'lb' | 'kg'
  template: string | null
  metadata: string | null
  test: boolean
  [key: string]: unknown
}

export interface ShippoShipment {
  object_id: string
  object_created: string
  object_updated: string
  object_owner: string
  status: string
  address_from: ShippoAddress | null
  address_to: ShippoAddress | null
  address_return: ShippoAddress | null
  parcels: ShippoParcel[]
  shipment_date: string | null
  carrier_accounts: string[]
  metadata: string
  rates: ShippoRate[]
  messages: unknown[]
  test: boolean
  extra: Record<string, unknown> | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status) {
    case 'SUCCESS':  return 'PENDING'
    case 'WAITING':  return 'PENDING'
    case 'QUEUED':   return 'PENDING'
    case 'ERROR':    return 'EXCEPTION'
    default:         return 'UNKNOWN'
  }
}

export function transformShipment(raw: ShippoShipment): Shipment {
  const parcel = raw.parcels?.[0]
  const distUnit = parcel?.distance_unit === 'cm' ? 'cm' as const : 'in' as const
  const massUnit = (parcel?.mass_unit ?? 'oz') as 'oz' | 'lb' | 'g' | 'kg'

  return {
    id: raw.object_id,
    status: mapShipmentStatus(raw.status),
    originAddress: raw.address_from ? transformAddress(raw.address_from) : undefined,
    destinationAddress: raw.address_to ? transformAddress(raw.address_to) : undefined,
    returnAddress: raw.address_return ? transformAddress(raw.address_return) : undefined,
    totalWeight: parcel ? toWeight(parcel.weight, massUnit) : undefined,
    dimensions: parcel
      ? toDimensions(parcel.length, parcel.width, parcel.height, distUnit)
      : undefined,
    reference: raw.metadata || undefined,
    createdAt: toISODate(raw.object_created),
    updatedAt: toISODate(raw.object_updated),
    metadata: raw as Record<string, unknown>,
  }
}
