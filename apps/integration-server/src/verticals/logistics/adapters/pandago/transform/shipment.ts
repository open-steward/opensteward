import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── pandago raw types ─────────────────────────────────────────────────────

export interface PandagoLocation {
  address?: string | null
  latitude?: number | null
  longitude?: number | null
  notes?: string | null
  [key: string]: unknown
}

export interface PandagoContact {
  name?: string | null
  phone_number?: string | null
  location?: PandagoLocation | null
  [key: string]: unknown
}

export interface PandagoOrder {
  order_id?: string | null
  client_order_id?: string | null
  status?: string | null
  delivery_fee?: number | null
  distance?: number | null
  currency_code?: string | null
  description?: string | null
  payment_method?: string | null
  amount?: number | null
  tracking_link?: string | null
  proof_of_delivery_url?: string | null
  proof_of_pickup_url?: string | null
  proof_of_return_url?: string | null
  sender?: PandagoContact | null
  recipient?: PandagoContact | null
  created_at?: number | null
  updated_at?: number | null
  cancellation_reason?: string | null
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'NEW':
    case 'RECEIVED':
    case 'WAITING_FOR_TRANSPORT':
      return 'PENDING'
    case 'ASSIGNED_TO_TRANSPORT':
    case 'COURIER_ACCEPTED_DELIVERY':
    case 'NEAR_VENDOR':
    case 'PICKED_UP':
    case 'COURIER_LEFT_VENDOR':
    case 'DELAYED':
      return 'IN_TRANSIT'
    case 'NEAR_CUSTOMER':
      return 'OUT_FOR_DELIVERY'
    case 'DELIVERED':
      return 'DELIVERED'
    case 'CANCELLED':
      return 'CANCELLED'
    case 'RETURNED_TO_VENDOR':
      return 'RETURNED'
    default:
      return 'UNKNOWN'
  }
}

// ─── Timestamp helpers ───────────────────────────────────────────────────────

/**
 * pandago timestamps are Unix epoch seconds (integer).
 * Convert to Date, falling back gracefully.
 */
function fromUnixSeconds(val: number | null | undefined): Date | undefined {
  if (val == null) return undefined
  const d = new Date(val * 1000)
  return isNaN(d.getTime()) ? undefined : d
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: PandagoOrder): Shipment {
  const createdAt = fromUnixSeconds(raw.created_at) ?? toISODate(raw.created_at)
  const updatedAt = fromUnixSeconds(raw.updated_at) ?? toISODate(raw.updated_at)

  return {
    id: raw.order_id ?? undefined,
    status: mapShipmentStatus(raw.status),
    trackingNumber: raw.order_id ?? undefined,
    carrierId: 'pandago',
    reference: raw.client_order_id ?? undefined,
    notes: raw.description ?? undefined,
    originAddress: raw.sender?.location
      ? {
          name: raw.sender.name ?? undefined,
          phone: raw.sender.phone_number ?? undefined,
          street1: raw.sender.location.address ?? undefined,
        }
      : undefined,
    destinationAddress: raw.recipient?.location
      ? {
          name: raw.recipient.name ?? undefined,
          phone: raw.recipient.phone_number ?? undefined,
          street1: raw.recipient.location.address ?? undefined,
        }
      : undefined,
    cost:
      raw.delivery_fee != null
        ? {
            amount: raw.delivery_fee,
            currency: raw.currency_code ?? 'SGD',
          }
        : undefined,
    labelUrl: raw.tracking_link ?? undefined,
    createdAt,
    updatedAt,
    metadata: raw as Record<string, unknown>,
  }
}
