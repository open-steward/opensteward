import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate, toWeight, parseDecimal } from '../../shared/transform'
import { transformAddress, type QuiqupAddress } from './address'

/**
 * Quiqup delivery/job resource — represents a single last-mile delivery task.
 * Quiqup uses "jobs" internally and "orders" at the partner-API level; each
 * order can contain one or more delivery jobs.
 */
export interface QuiqupDeliveryJob {
  id: string
  reference?: string | null
  status?: string | null
  tracking_number?: string | null
  tracking_url?: string | null
  service_type?: string | null
  pickup_address?: QuiqupAddress | null
  delivery_address?: QuiqupAddress | null
  weight_grams?: number | null
  price?: {
    amount?: number | null
    currency?: string | null
  } | null
  estimated_delivery_at?: string | null
  actual_delivery_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  label_url?: string | null
  notes?: string | null
  [key: string]: unknown
}

function mapJobStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'pending':
    case 'created':
      return 'PENDING'
    case 'accepted':
    case 'assigned':
    case 'label_created':
      return 'LABEL_CREATED'
    case 'collected':
    case 'in_transit':
    case 'at_hub':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'with_courier':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    case 'returned':
    case 'return_to_sender':
      return 'RETURNED'
    case 'failed':
    case 'exception':
    case 'delivery_failed':
      return 'EXCEPTION'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: QuiqupDeliveryJob): Shipment {
  return {
    id: raw.id,
    status: mapJobStatus(raw.status),
    trackingNumber: raw.tracking_number ?? undefined,
    serviceCode: raw.service_type ?? undefined,
    carrierId: 'quiqup',
    originAddress: transformAddress(raw.pickup_address),
    destinationAddress: transformAddress(raw.delivery_address),
    totalWeight:
      raw.weight_grams != null ? toWeight(raw.weight_grams, 'g') : undefined,
    estimatedDeliveryAt: toISODate(raw.estimated_delivery_at),
    actualDeliveryAt: toISODate(raw.actual_delivery_at),
    labelUrl: raw.label_url ?? undefined,
    cost:
      raw.price?.amount != null
        ? {
            amount: parseDecimal(raw.price.amount) ?? 0,
            currency: raw.price.currency ?? 'GBP',
          }
        : undefined,
    reference: raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
