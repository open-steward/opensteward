import type { Order } from '../../../schema/order'
import type { Address } from '../../../schema/shared'
import { toISODate } from '../../shared/transform'

// ── PPL CZ raw order types ────────────────────────────────────────────────

export interface PplCzOrderAddress {
  name?: string | null
  name2?: string | null
  street?: string | null
  city?: string | null
  zipCode?: string | null
  country?: string | null
  phone?: string | null
  email?: string | null
}

/**
 * PPL CZ pickup/shipping order (POST /order).
 * PPL calls these "collection orders" — they schedule a courier pickup.
 */
export interface PplCzOrder {
  orderId?: string | null
  /** Customer's own order reference */
  referenceId?: string | null
  /** Status: "Submitted" | "Confirmed" | "Cancelled" | "Completed" */
  status?: string | null
  collectionDate?: string | null
  depot?: string | null
  sender?: PplCzOrderAddress | null
  shipmentNumbers?: string[]
  createdAt?: string | null
  updatedAt?: string | null
  note?: string | null
  [key: string]: unknown
}

// ── Status mapping ────────────────────────────────────────────────────────

import type { OrderStatus } from '../../../schema/order'

function mapOrderStatus(status: string | null | undefined): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'submitted':
      return 'PROCESSING'
    case 'confirmed':
      return 'AWAITING_SHIPMENT'
    case 'completed':
      return 'SHIPPED'
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'PENDING'
  }
}

// ── Address transform ─────────────────────────────────────────────────────

function transformOrderAddress(raw: PplCzOrderAddress | null | undefined): Address | undefined {
  if (!raw) return undefined
  const addr: Address = {
    name: raw.name ?? undefined,
    company: raw.name2 ?? undefined,
    street1: raw.street ?? undefined,
    city: raw.city ?? undefined,
    postalCode: raw.zipCode ?? undefined,
    country: raw.country ?? undefined,
    phone: raw.phone ?? undefined,
    email: raw.email ?? undefined,
  }
  const hasAny = Object.values(addr).some((v) => v !== undefined)
  return hasAny ? addr : undefined
}

// ── Order transform ───────────────────────────────────────────────────────

export function transformOrder(raw: PplCzOrder): Order {
  const shipmentIds =
    raw.shipmentNumbers && raw.shipmentNumbers.length > 0
      ? raw.shipmentNumbers
      : undefined

  return {
    id: raw.orderId ?? undefined,
    status: mapOrderStatus(raw.status),
    orderNumber: raw.referenceId ?? undefined,
    originAddress: transformOrderAddress(raw.sender),
    shipmentIds,
    notes: raw.note ?? undefined,
    createdAt: toISODate(raw.createdAt),
    updatedAt: toISODate(raw.updatedAt),
    metadata: raw as Record<string, unknown>,
  }
}
