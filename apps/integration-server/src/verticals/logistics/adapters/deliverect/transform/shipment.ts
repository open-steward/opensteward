import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

// Deliverect delivery job as returned by /create_job or a status lookup
export interface DeliverectDeliveryJob {
  /** Internal Deliverect job id */
  externalJobId?: string | null
  /** Caller-supplied reference */
  jobId?: string | null
  canDeliver?: boolean | null
  status?: string | null
  /** Courier / provider that accepted the job */
  courier?: Record<string, unknown> | null
  /** Estimated price in minor currency units (cents) */
  price?: number | null
  currency?: string | null
  trackingUrl?: string | null
  pickupLocation?: Record<string, unknown> | null
  deliveryLocations?: Array<Record<string, unknown>> | null
  /** ETAs object: { pickupTime, deliveryTime } */
  ETAs?: Record<string, unknown> | null
  created?: string | null
  updated?: string | null
  [key: string]: unknown
}

function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'created':
    case 'accepted':
    case 'pending':
      return 'LABEL_CREATED'
    case 'picking_up':
    case 'at_pickup':
    case 'picked_up':
    case 'in_transit':
      return 'IN_TRANSIT'
    case 'delivering':
    case 'at_delivery':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
      return 'DELIVERED'
    case 'returned':
    case 'return':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
    case 'failed':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: DeliverectDeliveryJob): Shipment {
  const firstDropoff =
    Array.isArray(raw.deliveryLocations) && raw.deliveryLocations.length > 0
      ? (raw.deliveryLocations[0] ?? null)
      : null

  const eta = raw.ETAs as Record<string, unknown> | null | undefined
  const estimatedDeliveryAt = toISODate(eta?.deliveryTime ?? eta?.delivery_time)

  return {
    id: raw.externalJobId ?? raw.jobId ?? undefined,
    status: mapStatus(raw.status),
    trackingNumber: raw.externalJobId ?? raw.jobId ?? undefined,
    carrierId: 'deliverect',
    serviceCode: 'deliverect_dispatch',
    originAddress: toAddress(raw.pickupLocation ?? null),
    destinationAddress: toAddress(firstDropoff),
    labelUrl: raw.trackingUrl ?? undefined,
    estimatedDeliveryAt: estimatedDeliveryAt ?? undefined,
    cost:
      raw.price != null && raw.currency
        ? { amount: raw.price, currency: raw.currency as string }
        : undefined,
    reference: raw.jobId ?? undefined,
    createdAt: toISODate(raw.created),
    updatedAt: toISODate(raw.updated),
    metadata: raw as Record<string, unknown>,
  }
}
