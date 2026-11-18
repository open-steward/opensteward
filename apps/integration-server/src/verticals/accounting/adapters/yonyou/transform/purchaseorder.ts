import type { PurchaseOrder, PurchaseOrderStatus } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouPurchaseOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouPurchaseOrder {
  id?: string
  status?: number | string
  supplierid?: string
  currency?: string
  ttaxmny?: number
  vouchdate?: string
  lines?: YonyouPurchaseOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): PurchaseOrderStatus {
  switch (String(s)) {
    case '1': return 'ACTIVE'
    case '2': return 'COMPLETED'
    case '3': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformPurchaseOrder(raw: YonyouPurchaseOrder): PurchaseOrder {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.status),
    contactId: raw.supplierid ? String(raw.supplierid) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.ttaxmny,
    postedAt: raw.vouchdate ? new Date(raw.vouchdate) : undefined,
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
