import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface KingdeeOrderLine {
  id?: string
  description?: string
  price?: number
  qty?: number
  amount?: number
  acctId?: string
  [key: string]: unknown
}

export interface KingdeeOrder {
  id?: string
  status?: string
  custId?: string
  currId?: string
  totalAmount?: number
  billDate?: string
  lines?: KingdeeOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: string): OrderStatus {
  switch (s) {
    case 'A': return 'ACTIVE'
    case 'B': return 'COMPLETED'
    case 'C': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: KingdeeOrder): Order {
  return {
    id: raw.id ? String(raw.id) : '',
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.custId ? String(raw.custId) : undefined,
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
