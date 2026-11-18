/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface DebitoorPurchaseOrderRow {
  id: string
  productName: string
  unitNetPrice: number
  quantity: number
  netAmount: number
  accountId: string
  [key: string]: unknown
}

export interface DebitoorPurchaseOrder {
  id: string
  orderNumber: string
  date: string
  status: string
  supplierId: string
  currency: string
  totalAmount: number
  lines: DebitoorPurchaseOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: DebitoorPurchaseOrderRow): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemDescription: row.productName || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
  }
}

export function transformPurchaseOrder(raw: DebitoorPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
