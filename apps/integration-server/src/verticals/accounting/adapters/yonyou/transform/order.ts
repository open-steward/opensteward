import type { Order, OrderStatus } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface YonyouOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  amount?: number
  accountId?: string
  [key: string]: unknown
}

export interface YonyouOrder {
  id?: string
  status?: number | string
  custid?: string
  currency?: string
  ttaxmny?: number
  vouchdate?: string
  lines?: YonyouOrderLine[]
  [key: string]: unknown
}

function mapStatus(s?: number | string): OrderStatus {
  switch (String(s)) {
    case '1': return 'ACTIVE'
    case '2': return 'COMPLETED'
    case '3': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformOrder(raw: YonyouOrder): Order {
  return {
    id: raw.id ? String(raw.id) : '',
    type: 'SALES',
    status: mapStatus(raw.status),
    contactId: raw.custid ? String(raw.custid) : undefined,
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
