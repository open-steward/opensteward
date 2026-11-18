import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface EconomicSalesOrderLine {
  lineNumber: number
  description: string
  product: { productNumber: string; name: string } | null
  quantity: number
  unitNetPrice: number
  totalNetAmount: number
  [key: string]: unknown
}

export interface EconomicSalesOrder {
  orderNumber: number
  date: string
  currency: string
  netAmount: number
  grossAmount: number
  customer: { customerNumber: number; name: string } | null
  lines: EconomicSalesOrderLine[]
  isArchived: boolean
  isSent: boolean
  [key: string]: unknown
}

function mapStatus(order: EconomicSalesOrder): SalesOrderStatus {
  if (order.isArchived) return 'COMPLETED'
  return 'ACTIVE'
}

function mapLineitem(row: EconomicSalesOrderLine): Lineitem {
  return {
    id: String(row.lineNumber),
    itemId: row.product?.productNumber || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitNetPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalNetAmount,
  }
}

export function transformSalesOrder(raw: EconomicSalesOrder): SalesOrder {
  return {
    id: String(raw.orderNumber),
    status: mapStatus(raw),
    contactId: raw.customer?.customerNumber ? String(raw.customer.customerNumber) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.grossAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    date: toCalendarDate(order.postedAt),
    currency: order.currency,
    customer: order.contactId ? { customerNumber: Number(order.contactId) } : undefined,
    lines: order.lineItems?.map((li, i) => ({
      lineNumber: i + 1,
      description: li.itemDescription,
      product: li.itemId ? { productNumber: li.itemId } : undefined,
      quantity: li.unitQuantity,
      unitNetPrice: li.unitAmount,
    })),
  }
}
