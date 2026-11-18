import { toEpochSeconds } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface HoldedSalesOrderItem {
  id: string
  name: string
  description: string
  units: number
  subtotal: number
  total: number
  tax: number
  accountId: string
  [key: string]: unknown
}

export interface HoldedSalesOrder {
  id: string
  orderNum: string
  contact: string
  currency: string
  subtotal: number
  tax: number
  total: number
  items: HoldedSalesOrderItem[]
  date: number
  status: number
  [key: string]: unknown
}

function mapStatus(status: number): SalesOrderStatus {
  // Holded status: 0 = draft, 1 = active, 2 = completed, 3 = cancelled
  if (status === 3) return 'CANCELLED'
  if (status === 2) return 'COMPLETED'
  if (status === 1) return 'ACTIVE'
  return 'DRAFT'
}

function mapLineitem(row: HoldedSalesOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.subtotal && row.units ? row.subtotal / row.units : undefined,
    unitQuantity: row.units,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformSalesOrder(raw: HoldedSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contact || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date * 1000) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    contact: order.contactId,
    currency: order.currency,
    date: order.postedAt ? toEpochSeconds(order.postedAt) : undefined,
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      units: li.unitQuantity,
      subtotal: li.unitAmount && li.unitQuantity ? li.unitAmount * li.unitQuantity : undefined,
      accountId: li.accountId,
    })),
  }
}
