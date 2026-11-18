import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface QoyodPurchaseOrderLineItem {
  id?: number | null
  product_id?: number | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  tax_amount?: number | null
  total?: number | null
  account_id?: number | null
  [key: string]: unknown
}

export interface QoyodPurchaseOrder {
  id: number
  reference?: string | null
  vendor_id?: number | null
  date?: string | null
  expected_delivery_date?: string | null
  status?: string | null
  notes?: string | null
  currency?: string | null
  total?: number | null
  tax_total?: number | null
  line_items?: QoyodPurchaseOrderLineItem[]
  [key: string]: unknown
}

function mapStatus(raw: QoyodPurchaseOrder): PurchaseOrderStatus {
  const s = (raw.status ?? '').toLowerCase()
  if (s === 'received' || s === 'completed' || s === 'billed') return 'COMPLETED'
  if (s === 'cancelled' || s === 'canceled') return 'CANCELLED'
  return 'ACTIVE'
}

function mapLineItem(li: QoyodPurchaseOrderLineItem): Lineitem {
  return {
    id: li.id != null ? String(li.id) : undefined,
    itemId: li.product_id != null ? String(li.product_id) : undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_price ?? undefined,
    unitQuantity: li.quantity ?? undefined,
    totalAmount: li.total ?? undefined,
    taxAmount: li.tax_amount ?? undefined,
    accountId: li.account_id != null ? String(li.account_id) : undefined,
  }
}

export function transformPurchaseOrder(raw: QoyodPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw),
    contactId: raw.vendor_id != null ? String(raw.vendor_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total ?? undefined,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
