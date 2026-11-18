import { toCalendarDate } from '../../shared/transform'
import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface FikenSalesOrderLine {
  netPrice: number
  vatAmount: number
  grossPrice: number
  description: string
  productId: number
  quantity: number
  unitPrice: number
  vatType: string
  accountCode: string
  [key: string]: unknown
}

export interface FikenSalesOrder {
  orderId: number
  orderNumber: string
  customerId: number
  customerName: string
  currency: string
  net: number
  vat: number
  gross: number
  issueDate: string
  status: string
  orderLines: FikenSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'completed':
    case 'invoiced':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(row: FikenSalesOrderLine): Lineitem {
  return {
    itemId: row.productId ? String(row.productId) : undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.grossPrice,
    taxAmount: row.vatAmount || undefined,
    accountId: row.accountCode || undefined,
  }
}

export function transformSalesOrder(raw: FikenSalesOrder): SalesOrder {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformSalesOrder(order: Partial<SalesOrder>): Record<string, unknown> {
  return {
    customerId: order.contactId ? Number(order.contactId) : undefined,
    currency: order.currency,
    issueDate: toCalendarDate(order.postedAt),
    orderLines: order.lineItems?.map((li) => ({
      productId: li.itemId ? Number(li.itemId) : undefined,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountCode: li.accountId,
    })),
  }
}
