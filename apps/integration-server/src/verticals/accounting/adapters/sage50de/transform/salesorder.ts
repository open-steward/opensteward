/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: Desktop software — no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface Sage50DeSalesOrderLineItem {
  description?: string
  quantity?: number
  unit_price?: number
  net_amount?: number
  [key: string]: unknown
}

export interface Sage50DeSalesOrder {
  id: string
  date?: string
  due_date?: string
  total_amount?: number
  status?: string
  contact?: { id?: string }
  order_lines?: Sage50DeSalesOrderLineItem[]
  [key: string]: unknown
}

function toSalesOrderStatus(status: string | undefined): SalesOrderStatus {
  switch (status) {
    case 'DRAFT': return 'DRAFT'
    case 'OPEN': return 'ACTIVE'
    case 'PAID': return 'COMPLETED'
    case 'VOID': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: Sage50DeSalesOrder): SalesOrder {
  const lineItems: Lineitem[] = (raw.order_lines ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.net_amount,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total_amount,
    status: toSalesOrderStatus(raw.status),
    contactId: raw.contact?.id,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
