import type { Order, OrderStatus } from '../../../schema/order'

/**
 * Calxa order record as returned by GET /orders and GET /orders/:id.
 *
 * Orders represent sales or purchase order documents synced from the connected
 * accounting system.
 */
export interface CalxaOrder {
  id: string
  /** Human-readable order number. */
  orderNumber?: string
  /** Identifier of the contact (customer or supplier) on the order. */
  contactId?: string
  /** Order lifecycle status. */
  status?: string
  /** Whether this is a "SALES" or "PURCHASE" order. */
  type?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Total order value. */
  total?: number
  /** ISO 8601 order date. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): OrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'invoiced':
    case 'billed':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformOrder(raw: CalxaOrder): Order {
  const orderType = raw.type?.toUpperCase() === 'PURCHASE' ? 'PURCHASE' : 'SALES'
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    type: orderType,
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
