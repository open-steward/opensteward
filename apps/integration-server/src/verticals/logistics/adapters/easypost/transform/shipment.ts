import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type EasyPostAddress } from './address'

import type { EasyPostRate } from './rate'
import type { EasyPostPostageLabel } from './label'

export interface EasyPostParcel {
  id: string
  object: 'Parcel'
  mode: string
  length: number | null   // inches
  width: number | null    // inches
  height: number | null   // inches
  weight: number | null   // ounces
  predefined_package: string | null
  created_at: string
  updated_at: string
}

export interface EasyPostShipment {
  id: string
  object: 'Shipment'
  reference: string | null
  mode: string
  to_address: EasyPostAddress | null
  from_address: EasyPostAddress | null
  return_address: EasyPostAddress | null
  buyer_address: EasyPostAddress | null
  parcel: EasyPostParcel | null
  rates: EasyPostRate[]
  selected_rate: EasyPostRate | null
  postage_label: EasyPostPostageLabel | null
  tracking_code: string | null
  status: string
  insurance: string | null
  is_return: boolean
  order_id: string | null
  batch_id: string | null
  messages: unknown[]
  options: Record<string, unknown>
  created_at: string
  updated_at: string
  [key: string]: unknown
}

function mapShipmentStatus(status: string): ShipmentStatus {
  switch (status) {
    case 'pre_transit':          return 'LABEL_CREATED'
    case 'in_transit':           return 'IN_TRANSIT'
    case 'out_for_delivery':     return 'OUT_FOR_DELIVERY'
    case 'delivered':            return 'DELIVERED'
    case 'available_for_pickup': return 'OUT_FOR_DELIVERY'
    case 'return_to_sender':     return 'RETURNED'
    case 'cancelled':            return 'CANCELLED'
    case 'failure':
    case 'error':                return 'EXCEPTION'
    default:                     return 'UNKNOWN'
  }
}

export function transformShipment(raw: EasyPostShipment): Shipment {
  const parcel = raw.parcel
  const selectedRate = raw.selected_rate

  return {
    id: raw.id,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.tracking_code ?? undefined,
    carrierId: selectedRate?.carrier ?? undefined,
    serviceCode: selectedRate?.service ?? undefined,
    originAddress: raw.from_address ? transformAddress(raw.from_address) : undefined,
    destinationAddress: raw.to_address ? transformAddress(raw.to_address) : undefined,
    returnAddress: raw.return_address ? transformAddress(raw.return_address) : undefined,
    totalWeight: parcel ? toWeight(parcel.weight, 'oz') : undefined,
    dimensions: parcel
      ? toDimensions(parcel.length, parcel.width, parcel.height, 'in')
      : undefined,
    labelUrl: raw.postage_label?.label_url ?? undefined,
    cost: selectedRate
      ? {
          amount: parseDecimal(selectedRate.rate) ?? 0,
          currency: selectedRate.currency ?? 'USD',
        }
      : undefined,
    reference: raw.reference ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
