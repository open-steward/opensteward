import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface NiboPurchaseOrderItem {
  itemId: number
  productCode: string
  description: string
  quantity: number
  unitPrice: number
  totalValue: number
  taxValue: number
  accountCode: string
  [key: string]: unknown
}

export interface NiboPurchaseOrder {
  purchaseOrderId: number
  orderNumber: string
  supplierId: number
  currencyCode: string
  orderDate: string
  status: string
  totalValue: number
  taxValue: number
  items: NiboPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'Received' || status === 'Completed') return 'COMPLETED'
  if (status === 'Cancelled') return 'CANCELLED'
  if (status === 'Draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: NiboPurchaseOrderItem): Lineitem {
  return {
    id: String(row.itemId),
    accountId: row.accountCode || undefined,
    itemId: row.productCode || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.totalValue,
    taxAmount: row.taxValue || undefined,
  }
}

export function transformPurchaseOrder(raw: NiboPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.purchaseOrderId),
    status: mapStatus(raw.status),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalValue,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    supplierId: order.contactId ? Number(order.contactId) : undefined,
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
