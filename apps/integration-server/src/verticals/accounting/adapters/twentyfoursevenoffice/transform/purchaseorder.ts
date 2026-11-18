import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface TwentyFourSevenPurchaseOrderLine {
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

export interface TwentyFourSevenPurchaseOrder {
  id: string
  orderNumber: number
  supplierId: string
  currency: string
  orderDate: string
  status: string
  totalAmount: number
  taxAmount: number
  lines: TwentyFourSevenPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  if (status === 'completed' || status === 'received') return 'COMPLETED'
  if (status === 'cancelled' || status === 'voided') return 'CANCELLED'
  if (status === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: TwentyFourSevenPurchaseOrderLine): Lineitem {
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

export function transformPurchaseOrder(raw: TwentyFourSevenPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.supplierId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    supplierId: order.contactId,
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
