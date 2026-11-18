import { toCalendarDate } from '../../shared/transform'
import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinlyPurchaseOrderItem {
  id: string
  name: string
  description: string
  quantity: number
  unit_price: number
  total: number
  tax: number
  account_id: string
  [key: string]: unknown
}

export interface FinlyPurchaseOrder {
  id: string
  order_number: string
  vendor_id: string
  currency: string
  subtotal: number
  tax_amount: number
  total_amount: number
  items: FinlyPurchaseOrderItem[]
  date: string
  status: string
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  const s = status?.toLowerCase()
  if (s === 'completed' || s === 'received') return 'COMPLETED'
  if (s === 'cancelled' || s === 'void') return 'CANCELLED'
  if (s === 'draft') return 'DRAFT'
  return 'ACTIVE'
}

function mapLineitem(row: FinlyPurchaseOrderItem): Lineitem {
  return {
    id: row.id,
    accountId: row.account_id || undefined,
    itemName: row.name || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price || undefined,
    unitQuantity: row.quantity,
    totalAmount: row.total,
    taxAmount: row.tax || undefined,
  }
}

export function transformPurchaseOrder(raw: FinlyPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id,
    status: mapStatus(raw.status),
    contactId: raw.vendor_id || undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}

export function untransformPurchaseOrder(
  order: Partial<PurchaseOrder>,
): Record<string, unknown> {
  return {
    vendor_id: order.contactId,
    currency: order.currency,
    date: toCalendarDate(order.postedAt),
    items: order.lineItems?.map((li) => ({
      name: li.itemName,
      description: li.itemDescription,
      unit_price: li.unitAmount,
      quantity: li.unitQuantity,
      account_id: li.accountId,
    })),
  }
}
