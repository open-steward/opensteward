import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

/**
 * Calxa sales order record as returned by GET /sales-orders and
 * GET /sales-orders/:id.
 */
export interface CalxaSalesOrder {
  id: string
  /** Human-readable sales order number. */
  orderNumber?: string
  /** Identifier of the customer contact. */
  contactId?: string
  /** Lifecycle status. */
  status?: string
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

function mapStatus(status?: string): SalesOrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'invoiced':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformSalesOrder(raw: CalxaSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
