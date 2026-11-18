import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FinancioPurchaseOrderItem {
  id: string | number
  description: string
  qty: number
  unit_price: number
  amount: number
  tax_amount: number
  account_code: string
  tax_rate: number
  discount_amount: number
  [key: string]: unknown
}

export interface FinancioPurchaseOrder {
  id: string | number
  po_no: string
  po_date: string
  due_date: string
  sub_total: number
  tax_total: number
  grand_total: number
  status: string
  supplier_id: string | number
  supplier_name: string
  items: FinancioPurchaseOrderItem[]
  [key: string]: unknown
}

function mapStatus(status: string): PurchaseOrderStatus {
  switch (status) {
    case 'received':
      return 'COMPLETED'
    case 'cancelled':
      return 'CANCELLED'
    case 'approved':
      return 'ACTIVE'
    case 'draft':
      return 'DRAFT'
    default:
      return 'ACTIVE'
  }
}

function mapLineitem(item: FinancioPurchaseOrderItem): Lineitem {
  return {
    id: String(item.id),
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.tax_amount || undefined,
    discountAmount: item.discount_amount || undefined,
  }
}

export function transformPurchaseOrder(raw: FinancioPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    totalAmount: raw.grand_total,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.po_date ? new Date(raw.po_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
