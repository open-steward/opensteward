import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

// NetworkON order/shipment as returned by the REST API.
export interface NetworkONShipment {
  id?: string | number | null
  order_number?: string | null
  status?: string | null
  tracking_number?: string | null
  carrier?: string | null
  service_code?: string | null
  origin?: Record<string, unknown> | null
  destination?: Record<string, unknown> | null
  estimated_delivery?: string | null
  actual_delivery?: string | null
  label_url?: string | null
  weight?: number | null
  weight_unit?: string | null
  notes?: string | null
  reference?: string | null
  created_at?: string | null
  updated_at?: string | null
  [key: string]: unknown
}

// NetworkON order statuses mapped to canonical ShipmentStatus values.
function mapStatus(s: string | null | undefined): ShipmentStatus {
  switch ((s ?? '').toLowerCase()) {
    case 'pending':
    case 'created':
      return 'PENDING'
    case 'label_created':
    case 'label created':
    case 'ready':
    case 'ready_for_pickup':
      return 'LABEL_CREATED'
    case 'dispatched':
    case 'in_transit':
    case 'in transit':
    case 'picked_up':
    case 'picked up':
      return 'IN_TRANSIT'
    case 'out_for_delivery':
    case 'out for delivery':
    case 'on_route':
      return 'OUT_FOR_DELIVERY'
    case 'delivered':
    case 'completed':
    case 'successful':
      return 'DELIVERED'
    case 'failed':
    case 'exception':
    case 'returned_to_sender':
      return 'EXCEPTION'
    case 'returned':
      return 'RETURNED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'UNKNOWN'
  }
}

export function transformShipment(raw: NetworkONShipment): Shipment {
  const id = raw.id != null ? String(raw.id) : undefined
  return {
    id,
    status: mapStatus(raw.status),
    trackingNumber: raw.tracking_number ?? raw.order_number ?? id,
    carrierId: raw.carrier ?? 'networkon',
    serviceCode: raw.service_code ?? undefined,
    originAddress: toAddress(raw.origin ?? undefined),
    destinationAddress: toAddress(raw.destination ?? undefined),
    estimatedDeliveryAt: toISODate(raw.estimated_delivery),
    actualDeliveryAt: toISODate(raw.actual_delivery),
    labelUrl: raw.label_url ?? undefined,
    reference: raw.order_number ?? raw.reference ?? undefined,
    notes: raw.notes ?? undefined,
    createdAt: toISODate(raw.created_at),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
