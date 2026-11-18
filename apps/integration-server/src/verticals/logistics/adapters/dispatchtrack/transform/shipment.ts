import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toAddress, toISODate } from '../../shared/transform'

// ─── DispatchTrack raw types ──────────────────────────────────────────────────

/**
 * Raw service-order / dispatch record from the DispatchTrack API.
 * Fields are a union of the last-mile (beetrack) and North-America
 * (last-mile) response shapes.
 */
export interface DispatchTrackServiceOrder {
  id?: string | number | null
  number?: string | null
  identifier?: string | null
  status?: string | null
  date?: string | null
  delivery_date?: string | null
  request_delivery_date?: string | null
  scheduled_at?: string | null
  started_at?: string | null
  finished_at?: string | null
  created_at?: string | null
  updated_at?: string | null
  /** Contact / recipient details */
  contact_name?: string | null
  contact_address?: string | null
  contact_phone?: string | null
  contact_email?: string | null
  contact_id?: string | null
  /** Structured address fields (North-America API variant) */
  address?: Record<string, unknown> | null
  customer?: Record<string, unknown> | null
  /** Origin / warehouse */
  origin?: string | null
  place?: string | null
  store_code?: string | null
  /** Geo */
  latitude?: number | string | null
  longitude?: number | string | null
  /** Service metadata */
  service_type?: string | null
  route?: string | null
  truck?: Record<string, unknown> | null
  driver?: string | null
  /** Items / packages */
  items?: Array<Record<string, unknown>> | null
  pieces?: number | null
  /** Financial */
  amount?: number | string | null
  cod?: number | string | null
  payment_collected?: number | string | null
  /** Free-form */
  notes?: string | null
  description?: string | null
  [key: string]: unknown
}

// ─── Status mapping ────────────────────────────────────────────────────────────

/**
 * Map DispatchTrack service-order statuses onto canonical ShipmentStatus.
 *
 * DispatchTrack statuses (last-mile):
 *   new / pending  → not yet picked up by a route
 *   scheduled      → assigned to a route / driver
 *   started        → driver en-route
 *   finished       → successfully delivered
 *   unable_to_finish / failed → delivery exception
 *   cancelled      → cancelled
 */
function mapStatus(status: string | null | undefined): ShipmentStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'new':
    case 'pending':
      return 'PENDING'
    case 'label_created':
      return 'LABEL_CREATED'
    case 'scheduled':
    case 'assigned':
      return 'IN_TRANSIT'
    case 'started':
    case 'in_transit':
    case 'out_for_delivery':
      return 'OUT_FOR_DELIVERY'
    case 'finished':
    case 'delivered':
    case 'completed':
      return 'DELIVERED'
    case 'unable_to_finish':
    case 'failed':
    case 'exception':
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

// ─── Address helper ───────────────────────────────────────────────────────────

/**
 * Build a canonical Address from a DispatchTrack service order.
 *
 * The API may expose the destination either as a structured `address`/`customer`
 * nested object or as flat `contact_*` fields.
 */
function buildDestinationAddress(
  raw: DispatchTrackServiceOrder,
): ReturnType<typeof toAddress> {
  // Prefer the nested address/customer object when present.
  if (raw.address && typeof raw.address === 'object') {
    return toAddress({
      ...raw.address,
      name: raw.address['name'] ?? raw.contact_name,
      phone: raw.address['phone'] ?? raw.contact_phone,
      email: raw.address['email'] ?? raw.contact_email,
    })
  }
  if (raw.customer && typeof raw.customer === 'object') {
    return toAddress({
      ...raw.customer,
      name: (raw.customer as Record<string, unknown>)['name'] ?? raw.contact_name,
      phone: (raw.customer as Record<string, unknown>)['phone'] ?? raw.contact_phone,
      email: (raw.customer as Record<string, unknown>)['email'] ?? raw.contact_email,
    })
  }
  // Fall back to flat contact fields.
  if (raw.contact_name ?? raw.contact_address ?? raw.contact_phone) {
    return {
      name: raw.contact_name ?? undefined,
      street1: raw.contact_address ?? undefined,
      phone: raw.contact_phone ?? undefined,
      email: raw.contact_email ?? undefined,
    }
  }
  return undefined
}

// ─── Transform ────────────────────────────────────────────────────────────────

export function transformServiceOrder(raw: DispatchTrackServiceOrder): Shipment {
  const id = raw.id != null ? String(raw.id) : undefined
  const trackingNumber = raw.number ?? raw.identifier ?? id

  const deliveredAt =
    toISODate(raw.finished_at) ?? toISODate(raw.delivery_date) ?? undefined
  const estimatedDeliveryAt =
    toISODate(raw.request_delivery_date) ?? toISODate(raw.scheduled_at) ?? undefined

  return {
    id,
    status: mapStatus(raw.status),
    trackingNumber,
    carrierId: 'dispatchtrack',
    serviceCode: raw.service_type ?? undefined,
    warehouseId: raw.store_code ?? raw.origin ?? raw.place ?? undefined,
    destinationAddress: buildDestinationAddress(raw),
    notes: raw.notes ?? raw.description ?? undefined,
    reference: raw.number ?? raw.identifier ?? undefined,
    estimatedDeliveryAt,
    actualDeliveryAt: deliveredAt,
    createdAt: toISODate(raw.created_at) ?? toISODate(raw.date),
    updatedAt: toISODate(raw.updated_at),
    metadata: raw as Record<string, unknown>,
  }
}
