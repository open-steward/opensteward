import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal, toDimensions } from '../../shared/transform'
import { transformAddress, type TopshipAddress } from './address'

export interface TopshipShipmentItem {
  category?: string | null
  description?: string | null
  quantity?: number | null
  weight?: number | null
  value?: number | null
  dimension?: {
    length?: number | null
    width?: number | null
    height?: number | null
  } | null
  [key: string]: unknown
}

export interface TopshipShipment {
  id?: string | null
  trackingId?: string | null
  thirdPartyTrackingId?: string | null
  trackingUrl?: string | null
  label?: string | null         // URL to label PDF / waybill
  invoice?: string | null
  shipmentStatus?: string | null
  shipmentRoute?: string | null
  itemCollectionMode?: string | null
  isPaid?: boolean | null
  pricingTier?: string | null
  insuranceType?: string | null
  insuranceCharge?: number | null
  pickupCharge?: number | null
  shipmentCharge?: number | null
  commissionOnShipmentCharge?: number | null
  totalCharge?: number | null
  discount?: number | null
  currency?: string | null
  valueAddedTaxCharge?: number | null
  estimatedDeliveryDate?: string | null
  senderDetail?: TopshipAddress | null
  receiverDetail?: TopshipAddress | null
  items?: TopshipShipmentItem[]
  dimension?: {
    length?: number | null
    width?: number | null
    height?: number | null
  } | null
  createdDate?: string | null
  updatedDate?: string | null
  [key: string]: unknown
}

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'draft':
    case 'paymentpending':
    case 'payment_pending':
    case 'pendingconfirmation':
    case 'pending_confirmation':    return 'PENDING'
    case 'confirmed':
    case 'awaitingpickup':
    case 'awaiting_pickup':
    case 'awaitingdropoff':
    case 'awaiting_drop_off':
    case 'shipmentprocessing':
    case 'shipment_processing':     return 'LABEL_CREATED'
    case 'intransit':
    case 'in_transit':
    case 'pickupdispatched':
    case 'pickup_dispatched':
    case 'successfullypicked':
    case 'successfully_picked':
    case 'receivedat hub':
    case 'receivedathub':
    case 'arrivednigeriarecei':
    case 'arnigeria':
    case 'pickupinprogress':
    case 'pickup_in_progress':
    case 'assignedfordelivery':
    case 'assigned_for_delivery':
    case 'deliveryinprogress':
    case 'delivery_in_progress':
    case 'riderassigned':
    case 'rider_assigned':          return 'IN_TRANSIT'
    case 'outfordelivery':
    case 'out_for_delivery':        return 'OUT_FOR_DELIVERY'
    case 'delivered':               return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
    case 'pickupcancelled':
    case 'pickup_cancelled':
    case 'cancellationpending':
    case 'cancellation_pending':    return 'CANCELLED'
    case 'deliveryfailed':
    case 'delivery_failed':
    case 'pickupfailed':
    case 'pickup_failed':           return 'EXCEPTION'
    default:                        return 'UNKNOWN'
  }
}

export function transformShipment(raw: TopshipShipment): Shipment {
  const dim = raw.dimension
  const totalCharge = raw.totalCharge ?? raw.shipmentCharge

  return {
    id: raw.id ?? undefined,
    status: mapShipmentStatus(raw.shipmentStatus),
    trackingNumber: raw.trackingId ?? undefined,
    originAddress: raw.senderDetail ? transformAddress(raw.senderDetail) : undefined,
    destinationAddress: raw.receiverDetail ? transformAddress(raw.receiverDetail) : undefined,
    dimensions:
      dim?.length != null && dim.width != null && dim.height != null
        ? toDimensions(dim.length, dim.width, dim.height, 'cm')
        : undefined,
    totalWeight:
      raw.items && raw.items.length > 0
        ? toWeight(
            raw.items.reduce((sum, item) => sum + (item.weight ?? 0), 0),
            'kg',
          )
        : undefined,
    labelUrl: raw.label ?? undefined,
    cost:
      totalCharge != null
        ? {
            amount: parseDecimal(totalCharge) ?? 0,
            // Topship charges in Kobo (1/100 NGN) — store as-is; consumer converts
            currency: raw.currency ?? 'NGN',
          }
        : undefined,
    estimatedDeliveryAt: toISODate(raw.estimatedDeliveryDate),
    createdAt: toISODate(raw.createdDate),
    updatedAt: toISODate(raw.updatedDate),
    metadata: raw as Record<string, unknown>,
  }
}
