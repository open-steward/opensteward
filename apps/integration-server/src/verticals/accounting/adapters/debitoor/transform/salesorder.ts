/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Platform deprecated (Debitoor shut down).
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface DebitoorSalesOrderRow {
  id: string
  productName: string
  unitNetPrice: number
  quantity: number
  netAmount: number
  accountId: string
  [key: string]: unknown
}

export interface DebitoorSalesOrder {
  id: string
  orderNumber: string
  date: string
  status: string
  customerId: string
  currency: string
  totalAmount: number
  lines: DebitoorSalesOrderRow[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'ACTIVE'
  }
}

function mapLineitem(row: DebitoorSalesOrderRow): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemDescription: row.productName || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.netAmount,
  }
}

export function transformSalesOrder(raw: DebitoorSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
