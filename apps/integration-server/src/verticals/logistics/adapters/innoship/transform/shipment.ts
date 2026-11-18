import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type InnoshipAddress } from './address'

/**
 * Innoship order/shipment as returned by POST /api/Order and related endpoints.
 * Field names are snake_case-inspired camelCase as seen in their API.
 */
export interface InnoshipOrder {
  orderId?: number | null
  externalOrderId?: string | null
  correlationId?: string | null
  courierId?: number | null
  courierName?: string | null
  shipmentAwb?: string | null
  trackingNumber?: string | null
  serviceId?: number | null
  shipmentDate?: string | null
  addressFrom?: InnoshipAddress | null
  addressTo?: InnoshipAddress | null
  addressReturn?: InnoshipAddress | null
  parcels?: InnoshipParcel[] | null
  totalWeight?: number | null
  status?: string | null
  currentStatus?: string | null
  currentStatusId?: number | null
  trackUrl?: string | null
  price?: number | null
  currency?: string | null
  isPaid?: boolean | null
  createdDate?: string | null
  updatedDate?: string | null
  [key: string]: unknown
}

export interface InnoshipParcel {
  sequenceNo?: number | null
  weight?: number | null
  width?: number | null
  height?: number | null
  length?: number | null
  awb?: string | null
  barcode?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  if (!status) return 'UNKNOWN'
  const s = status.toLowerCase()
  if (s.includes('delivered') || s.includes('livrat')) return 'DELIVERED'
  if (s.includes('out_for_delivery') || s.includes('in_delivery') || s.includes('la livrare')) return 'OUT_FOR_DELIVERY'
  if (s.includes('in_transit') || s.includes('transit') || s.includes('picked')) return 'IN_TRANSIT'
  if (s.includes('label') || s.includes('created') || s.includes('awb')) return 'LABEL_CREATED'
  if (s.includes('return') || s.includes('retur')) return 'RETURNED'
  if (s.includes('cancel')) return 'CANCELLED'
  if (s.includes('exception') || s.includes('incident')) return 'EXCEPTION'
  if (s.includes('pending')) return 'PENDING'
  return 'UNKNOWN'
}

export function transformShipment(raw: InnoshipOrder): Shipment {
  const firstParcel = (raw.parcels ?? [])[0]

  return {
    id: raw.orderId != null ? String(raw.orderId) : (raw.correlationId ?? undefined),
    status: mapShipmentStatus(raw.currentStatus ?? raw.status),
    trackingNumber: raw.shipmentAwb ?? raw.trackingNumber ?? undefined,
    carrierId: raw.courierId != null ? String(raw.courierId) : undefined,
    serviceCode: raw.serviceId != null ? String(raw.serviceId) : undefined,
    originAddress: transformAddress(raw.addressFrom),
    destinationAddress: transformAddress(raw.addressTo),
    returnAddress: transformAddress(raw.addressReturn),
    totalWeight: toWeight(raw.totalWeight ?? firstParcel?.weight, 'kg'),
    labelUrl: raw.trackUrl ?? undefined,
    cost: raw.price != null
      ? {
          amount: parseDecimal(raw.price) ?? 0,
          currency: raw.currency ?? 'RON',
        }
      : undefined,
    reference: raw.externalOrderId ?? undefined,
    createdAt: toISODate(raw.createdDate ?? raw.shipmentDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
