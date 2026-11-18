import type { Shipment, ShipmentStatus } from '../../../schema/shipment'
import { toISODate } from '../../shared/transform'

// ─── Borzo raw types ───────────────────────────────────────────────────────

export interface BorzoPoint {
  address: string | null
  contact_person?: {
    name?: string | null
    phone?: string | null
  } | null
  latitude?: string | null
  longitude?: string | null
  [key: string]: unknown
}

export interface BorzoCourier {
  name?: string | null
  phone?: string | null
  [key: string]: unknown
}

export interface BorzoOrder {
  order_id?: number | null
  order_name?: string | null
  status?: string | null
  payment_amount?: string | null
  delivery_fee_amount?: string | null
  matter?: string | null
  vehicle_type_id?: number | null
  points?: BorzoPoint[] | null
  courier?: BorzoCourier | null
  created_at?: string | null
  [key: string]: unknown
}

export interface BorzoOrderResponse {
  is_successful: boolean
  order?: BorzoOrder | null
  errors?: unknown[]
  [key: string]: unknown
}

// ─── Status mapping ─────────────────────────────────────────────────────────

function mapShipmentStatus(status: string | null | undefined): ShipmentStatus {
  switch (status) {
    case 'new':       return 'PENDING'
    case 'available': return 'PENDING'
    case 'active':    return 'IN_TRANSIT'
    case 'delayed':   return 'IN_TRANSIT'
    case 'completed': return 'DELIVERED'
    case 'canceled':  return 'CANCELLED'
    default:          return 'UNKNOWN'
  }
}

// ─── Transform ──────────────────────────────────────────────────────────────

export function transformShipment(raw: BorzoOrder): Shipment {
  const originPoint = raw.points?.[0] ?? undefined
  const destPoint = raw.points && raw.points.length > 1 ? raw.points[raw.points.length - 1] : undefined

  const paymentAmountStr = raw.payment_amount ?? undefined
  const costAmount = paymentAmountStr !== undefined ? parseFloat(paymentAmountStr) : undefined

  return {
    id: raw.order_id != null ? String(raw.order_id) : undefined,
    status: mapShipmentStatus(raw.status),
    carrierId: 'borzo',
    trackingNumber: raw.order_name ?? undefined,
    originAddress: originPoint?.address
      ? {
          street1: originPoint.address,
          phone: originPoint.contact_person?.phone ?? undefined,
          name: originPoint.contact_person?.name ?? undefined,
        }
      : undefined,
    destinationAddress: destPoint?.address
      ? {
          street1: destPoint.address,
          phone: destPoint.contact_person?.phone ?? undefined,
          name: destPoint.contact_person?.name ?? undefined,
        }
      : undefined,
    cost:
      costAmount !== undefined && !isNaN(costAmount)
        ? { amount: costAmount, currency: 'INR' }
        : undefined,
    notes: raw.matter ?? undefined,
    createdAt: toISODate(raw.created_at),
    metadata: raw as Record<string, unknown>,
  }
}
