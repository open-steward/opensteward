import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface MoyskladSalesOrderLine {
  id?: string
  description?: string
  price?: number
  quantity?: number
  sum?: number
  account?: { meta?: { href?: string } }
  [key: string]: unknown
}

export interface MoyskladSalesOrder {
  id?: string
  state?: { name?: string }
  counterparty?: { meta?: { href?: string } }
  currency?: { name?: string }
  sum?: number
  moment?: string
  positions?: { rows?: MoyskladSalesOrderLine[] }
  [key: string]: unknown
}

function mapStatus(s?: string): SalesOrderStatus {
  switch (s?.toLowerCase()) {
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

function getLastSegment(href?: string): string | undefined {
  if (!href) return undefined
  const parts = href.split('/')
  return parts[parts.length - 1] || undefined
}

export function transformSalesOrder(raw: MoyskladSalesOrder): SalesOrder {
  return {
    id: raw.id ? String(raw.id) : '',
    status: mapStatus(raw.state?.name),
    contactId: getLastSegment(raw.counterparty?.meta?.href),
    currency: raw.currency?.name || undefined,
    totalAmount: raw.sum != null ? raw.sum / 100 : undefined,
    postedAt: raw.moment ? new Date(raw.moment) : undefined,
    lineItems: (raw.positions?.rows ?? []).map(l => ({
      id: l.id ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.price != null ? l.price / 100 : undefined,
      unitQuantity: l.quantity,
      totalAmount: l.sum != null ? l.sum / 100 : undefined,
      accountId: getLastSegment(l.account?.meta?.href),
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
