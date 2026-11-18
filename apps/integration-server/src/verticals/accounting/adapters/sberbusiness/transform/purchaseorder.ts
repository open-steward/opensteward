import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface SberbusinessPurchaseOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface SberbusinessPurchaseOrder {
  id?: string
  status?: string
  supplierId?: string
  currencyCode?: string
  totalAmount?: number
  date?: string
  lines?: SberbusinessPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): PurchaseOrderStatus {
  switch (s) {
    case 'ACTIVE': return 'ACTIVE'
    case 'COMPLETED': return 'COMPLETED'
    case 'CANCELLED': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: SberbusinessPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    contactId: raw.supplierId ? String(raw.supplierId) : undefined,
    currency: raw.currencyCode || undefined,
    totalAmount: raw.totalAmount,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price,
      unitQuantity: l.quantity,
      totalAmount: l.amount,
      accountId: l.accountId ? String(l.accountId) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
