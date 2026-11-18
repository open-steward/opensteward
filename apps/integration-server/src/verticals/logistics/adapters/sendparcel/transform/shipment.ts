import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, toDimensions, parseDecimal } from '../../shared/transform'
import { transformAddress, type SendParcelAddress } from './address'

/**
 * SendParcel parcel (package) sub-object.
 */
export interface SendParcelParcel {
  weight?: number | null       // kg
  length?: number | null       // cm
  width?: number | null        // cm
  height?: number | null       // cm
  [key: string]: unknown
}

/**
 * SendParcel shipment object as returned by the REST API.
 */
export interface SendParcelShipment {
  id?: string | null
  reference?: string | null
  status?: string | null
  trackingNumber?: string | null
  carrier?: string | null
  service?: string | null
  warehouseId?: string | null
  senderAddress?: SendParcelAddress | null
  receiverAddress?: SendParcelAddress | null
  returnAddress?: SendParcelAddress | null
  parcel?: SendParcelParcel | null
  labelUrl?: string | null
  price?: number | null
  currency?: string | null
  notes?: string | null
  estimatedDelivery?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'created':
    case 'label_created':    return 'LABEL_CREATED'
    case 'in_transit':
    case 'transit':          return 'IN_TRANSIT'
    case 'out_for_delivery': return 'OUT_FOR_DELIVERY'
    case 'delivered':        return 'DELIVERED'
    case 'exception':
    case 'error':            return 'EXCEPTION'
    case 'returned':
    case 'return_to_sender': return 'RETURNED'
    case 'cancelled':
    case 'canceled':         return 'CANCELLED'
    default:                 return 'UNKNOWN'
  }
}

export function transformShipment(raw: SendParcelShipment): Shipment {
  const parcel = raw.parcel

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.trackingNumber ?? undefined,
    carrierId: raw.carrier ?? undefined,
    serviceCode: raw.service ?? undefined,
    warehouseId: raw.warehouseId ?? undefined,
    originAddress: raw.senderAddress ? transformAddress(raw.senderAddress) : undefined,
    destinationAddress: raw.receiverAddress ? transformAddress(raw.receiverAddress) : undefined,
    returnAddress: raw.returnAddress ? transformAddress(raw.returnAddress) : undefined,
    totalWeight: parcel ? toWeight(parcel.weight, 'kg') : undefined,
    dimensions: parcel
      ? toDimensions(parcel.length, parcel.width, parcel.height, 'cm')
      : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    cost:
      raw.price !== null && raw.price !== undefined
        ? {
            amount: parseDecimal(raw.price) ?? 0,
            currency: raw.currency ?? 'EUR',
          }
        : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDelivery),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
