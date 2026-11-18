import { toCalendarDate } from '../../shared/transform'
import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface NiboOrderItem {
  itemId: number
  productCode: string
  description: string
  quantity: number
  unitPrice: number
  totalValue: number
  taxValue: number
  accountCode: string
  discountValue: number
  [key: string]: unknown
}

export interface NiboOrder {
  orderId: number
  orderNumber: string
  customerId: number
  currencyCode: string
  orderDate: string
  status: string
  totalValue: number
  taxValue: number
  items: NiboOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): OrderStatus {
  if (status === 'Completed' || status === 'Invoiced') return 'COMPLETED'
  if (status === 'Cancelled') return 'CANCELLED'
  if (status === 'Draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: NiboOrderItem): Lineitem {
  return {
    id: String(row.itemId),
    accountId: row.accountCode || undefined,
    itemId: row.productCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalValue,
    taxAmount: row.taxValue || undefined,
    discountAmount: row.discountValue || undefined,
  }
}

export function transformOrder(raw: NiboOrder): Order {
  return {
    id: String(raw.orderId),
    status: mapStatus(raw.status),
    type: 'SALES',
    contactId: raw.customerId ? String(raw.customerId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalValue,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformOrder(order: Partial<Order>): Record<string, unknown> {
  return {
    customerId: order.contactId ? Number(order.contactId) : undefined,
    currencyCode: order.currency,
    orderDate: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      productCode: li.itemId,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountCode: li.accountId,
    })),
  }
}
