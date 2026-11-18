/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface DatevSalesOrderLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  amount: number
  [key: string]: unknown
}

export interface DatevSalesOrder {
  id: string | number
  date: string
  total_amount: number
  status: string
  contact_id: string | number
  line_items: DatevSalesOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'active':
    case 'open':
      return 'ACTIVE'
    default:
      return 'DRAFT'
  }
}

function mapLineitem(item: DatevSalesOrderLineItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.amount,
  }
}

export function transformSalesOrder(raw: DatevSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
