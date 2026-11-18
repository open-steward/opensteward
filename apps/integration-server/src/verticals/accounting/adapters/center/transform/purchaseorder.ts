import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface CenterPurchaseOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unitPrice: number
  total: number
  taxAmount: number
  accountId: string
  [key: string]: unknown
}

export interface CenterPurchaseOrder {
  id: string
  orderNumber: string
  contactId: string
  currency: string
  subtotal: number
  taxAmount: number
  total: number
  items: CenterPurchaseOrderItem[]
  date: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = status?.toLowerCase() ?? ''
  if (s === 'completed' || s === 'received') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: CenterPurchaseOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.accountId || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.taxAmount || undefined,
  }
}

export function transformPurchaseOrder(raw: CenterPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.contactId || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    contactId: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      accountId: li.accountId,
    })),
  }
}
