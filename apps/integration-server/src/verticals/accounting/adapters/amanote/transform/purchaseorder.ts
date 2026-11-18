import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface AmanotePurchaseOrderItem {
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  [key: string]: unknown
}

export interface AmanotePurchaseOrder {
  id: string | number
  date?: string
  due_date?: string
  total?: number
  status?: string
  contact_id?: string | number
  items?: AmanotePurchaseOrderItem[]
  [key: string]: unknown
}

function toPurchaseOrderStatus(status: string | undefined): PurchaseOrderStatus {
  switch (status) {
    case 'draft': return 'DRAFT'
    case 'sent': return 'ACTIVE'
    case 'paid': return 'COMPLETED'
    case 'void': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: AmanotePurchaseOrder): PurchaseOrder {
  const lineItems: Lineitem[] = (raw.items ?? []).map((item) => ({
    description: item.description,
    quantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    metadata: item as Record<string, unknown>,
  }))

  return {
    id: String(raw.id),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    totalAmount: raw.total,
    status: toPurchaseOrderStatus(raw.status),
    contactId: raw.contact_id !== undefined ? String(raw.contact_id) : undefined,
    lineItems: lineItems.length > 0 ? lineItems : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
