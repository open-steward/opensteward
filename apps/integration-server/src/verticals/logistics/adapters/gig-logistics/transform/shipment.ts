import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type GigAddress } from './address'
import { GIG_DEFAULT_CURRENCY } from '../constants'

/**
 * Raw shipment (waybill) object as returned by the GIG Logistics API.
 *
 * GIGL typically refers to shipments as "waybills". The `waybillNumber` is the
 * carrier-level tracking reference while `id` is the internal DB identifier.
 */
export interface GigShipment {
  id?: string | null
  waybillNumber?: string | null
  referenceNumber?: string | null
  shipmentStatus?: string | null
  /** Canonical status code used by some GIGL API versions. */
  status?: string | null
  serviceCode?: string | null
  serviceName?: string | null
  senderDetail?: GigAddress | null
  receiverDetail?: GigAddress | null
  weight?: number | null
  weightUnit?: string | null
  deliveryPrice?: number | null
  currency?: string | null
  declaredValue?: number | null
  pickupDate?: string | null
  estimatedDeliveryDate?: string | null
  deliveredDate?: string | null
  labelUrl?: string | null
  description?: string | null
  createdAt?: string | null
  updatedAt?: string | null
  [key: string]: unknown
}

/**
 * Maps GIGL shipment status strings to the canonical ShipmentStatus enum.
 *
 * GIGL status vocabulary observed in the wild:
 *   Pending, Collected, PickedUp, AtServiceCenter, InTransit, OutForDelivery,
 *   Delivered, Returned, Cancelled, Exception, FailedDelivery
 */
function mapShipmentStatus(raw: string | null | undefined): ShipmentStatus {
  if (!raw) return 'UNKNOWN'
  const s = raw.toLowerCase().replace(/[_\s-]/g, '')
  switch (s) {
    case 'pending':
    case 'created':
    case 'labelcreated':
      return 'LABEL_CREATED'
    case 'collected':
    case 'pickedup':
    case 'atservicecenter':
    case 'intransit':
    case 'transit':
      return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'outfordelivery1':
    case 'outfordelivery2':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
    case 'returntosender':
    case 'returnedtosender':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'exception':
    case 'faileddelivery':
    case 'failed':
    case 'error':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: GigShipment): Shipment {
  const weightKg = parseDecimal(raw.weight)
  const weightUnit = raw.weightUnit?.toLowerCase() === 'g' ? 'g' : 'kg'

  const rawStatus = raw.shipmentStatus ?? raw.status
  const amount = parseDecimal(raw.deliveryPrice)
  const currency = raw.currency ?? GIG_DEFAULT_CURRENCY

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(rawStatus),
    trackingNumber: raw.waybillNumber ?? undefined,
    serviceCode: raw.serviceCode ?? undefined,
    originAddress: raw.senderDetail ? transformAddress(raw.senderDetail) : undefined,
    destinationAddress: raw.receiverDetail ? transformAddress(raw.receiverDetail) : undefined,
    totalWeight:
      weightKg !== undefined ? toWeight(weightKg, weightUnit as 'g' | 'kg') : undefined,
    labelUrl: raw.labelUrl ?? undefined,
    cost:
      amount !== undefined
        ? { amount, currency }
        : undefined,
    reference: raw.referenceNumber ?? undefined,
    notes: raw.description ?? undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    actualDeliveryAt: toISODate(raw.deliveredDate),
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
