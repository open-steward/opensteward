import { toCalendarDate } from '../../shared/transform'
/**
 * AUDIT: No public REST API documentation available for this platform.
 * Field names in this interface are best-effort approximations.
 * Manual verification against a live API connection is required.
 * Reason: On-premise / no public REST API.
 */

import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface AccountEdgeSalesOrderLineItem {
  id: string
  description: string
  quantity: number
  unit_price: number
  amount: number
  tax_amount: number
  account_id: string
  discount: number
  [key: string]: unknown
}

export interface AccountEdgeSalesOrder {
  id: string
  order_number: string
  contact_id: string
  currency: string
  total: number
  tax_amount: number
  line_items: AccountEdgeSalesOrderLineItem[]
  date: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'completed' || s === 'invoiced') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: AccountEdgeSalesOrderLineItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.tax_amount || undefined,
    discountAmount: row.discount || undefined,
  }
}

export function transformSalesOrder(raw: AccountEdgeSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contact_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    line_items: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
