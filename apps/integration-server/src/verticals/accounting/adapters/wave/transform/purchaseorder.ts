import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface WavePurchaseOrderItem {
  id: string
  description: string
  quantity: number
  unitPrice: number
  amount: number
  account: { id: string } | null
  taxes: { amount: number; salesTax: { id: string; name: string; rate: number } }[]
  [key: string]: unknown
}

export interface WavePurchaseOrder {
  id: string
  orderNumber: string
  vendor: { id: string } | null
  currency: { code: string } | null
  totalAmount: number
  taxAmount: number
  orderDate: string
  status: string
  items: WavePurchaseOrderItem[]
  createdAt: string
  modifiedAt: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = status.toUpperCase()
  if (s === 'COMPLETED' || s === 'RECEIVED') return 'COMPLETED'
  if (s === 'CANCELLED' || s === 'VOIDED') return 'CANCELLED'
  if (s === 'DRAFT') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: WavePurchaseOrderItem): Lineitem {
  const taxAmount = row.taxes?.reduce((sum, t) => sum + (t.amount ?? 0), 0) || undefined
  return {
    id: row.id,
    accountId: row.account?.id || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unitPrice,
    unitQuantity: row.quantity,
    totalAmount: row.amount,
    taxAmount,
  }
}

export function transformPurchaseOrder(raw: WavePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.vendor?.id || undefined,
    currency: raw.currency?.code || undefined,
    totalAmount: raw.totalAmount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.orderDate ? new Date(raw.orderDate) : undefined,
    createdAt: raw.createdAt ? new Date(raw.createdAt) : undefined,
    updatedAt: raw.modifiedAt ? new Date(raw.modifiedAt) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(order: Partial<PurchaseOrder>): Record<string, unknown> {
  return {
    vendor: order.contactId ? { id: order.contactId } : undefined,
    currency: order.currency ? { code: order.currency } : undefined,
    orderDate: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      description: li.itemDescription,
      unitPrice: li.unitAmount,
      quantity: li.unitQuantity,
      account: li.accountId ? { id: li.accountId } : undefined,
    })),
  }
}
