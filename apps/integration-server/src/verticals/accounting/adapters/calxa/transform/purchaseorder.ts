import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'

/**
 * Calxa purchase order record as returned by GET /purchase-orders and
 * GET /purchase-orders/:id.
 */
export interface CalxaPurchaseOrder {
  id: string
  /** Human-readable purchase order number. */
  orderNumber?: string
  /** Identifier of the supplier contact. */
  contactId?: string
  /** Lifecycle status. */
  status?: string
  /** ISO 4217 currency code. */
  currency?: string
  /** Total order value including tax. */
  total?: number
  /** ISO 8601 order date. */
  date?: string
  createdAt?: string
  updatedAt?: string
  [key: string]: unknown
}

function mapStatus(status?: string): PurchaseOrderStatus {
  switch ((status ?? '').toLowerCase()) {
    case 'completed':
    case 'received':
    case 'billed':
      return 'COMPLETED'
    case 'cancelled':
    case 'canceled':
      return 'CANCELLED'
    default:
      return 'ACTIVE'
  }
}

export function transformPurchaseOrder(raw: CalxaPurchaseOrder): PurchaseOrder {
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
