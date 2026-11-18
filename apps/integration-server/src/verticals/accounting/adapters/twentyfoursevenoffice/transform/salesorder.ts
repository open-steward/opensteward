import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface TwentyFourSevenSalesOrderLine {
  id: string
  productId: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  taxCode: string
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface TwentyFourSevenSalesOrder {
  id: string
  orderNumber: number
  customerId: string
  currency: string
  orderDate: string
  status: string
  totalAmount: number
  taxAmount: number
  lines: TwentyFourSevenSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  if (status === 'completed' || status === 'invoiced') return 'COMPLETED'
  if (status === 'cancelled' || status === 'voided') return 'CANCELLED'
  if (status === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: TwentyFourSevenSalesOrderLine): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemId: row.productId || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount: row.taxAmount || undefined,
    taxrateId: row.taxCode || undefined,
  }
}

export function transformSalesOrder(raw: TwentyFourSevenSalesOrder): SalesOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.customerId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customerId: order.contactId,
    currency: order.currency,
    orderDate: toCalendarDate(order.postedAt),
    lines: order.lineItems?.map((li) => ({
      productId: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
