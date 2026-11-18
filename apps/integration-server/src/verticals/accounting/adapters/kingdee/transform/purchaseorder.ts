import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeePurchaseOrderLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  acctId?: string
  [key: string]: unknown
}

export interface KingdeePurchaseOrder {
  id?: string
  status?: string
  vendorId?: string
  currId?: string
  totalAmount?: number
  billDate?: string
  lines?: KingdeePurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): PurchaseOrderStatus {
  switch (s) {
    case 'A': return 'ACTIVE'
    case 'B': return 'COMPLETED'
    case 'C': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: KingdeePurchaseOrder): PurchaseOrder {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    contactId: raw.vendorId ? String(raw.vendorId) : undefined,
    currency: raw.currId || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.billDate ? new Date(raw.billDate) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.qty,
      totalAmount: l.amount,
      accountId: l.acctId ? String(l.acctId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
