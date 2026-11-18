import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FikenOrderLine {
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

export interface FikenOrder {
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
  orderLines: FikenOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
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

function mapLineitem(row: FikenOrderLine): Lineitem {
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

export function transformOrder(raw: FikenOrder): Order {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.gross,
    lineItems: (raw.orderLines ?? []).map(mapLineitem),
    postedAt: raw.issueDate ? new Date(raw.issueDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
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
