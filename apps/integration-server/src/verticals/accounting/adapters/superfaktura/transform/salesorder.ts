import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'

export interface SuperfakturaSalesOrderLine {
  id: string | number
  description?: string
  unit_price?: number
  quantity?: number
  total?: number
  account_id?: string
  [key: string]: unknown
}

export interface SuperfakturaSalesOrder {
  id: string | number
  status?: number
  client_id?: string | number
  currency?: string
  total?: number
  created?: string
  order_items?: SuperfakturaSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: number): SalesOrderStatus {
  switch (status) {
    case 2: return 'ACTIVE'
    case 3: return 'COMPLETED'
    case 4: return 'CANCELLED'
    case 1: default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: SuperfakturaSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    contactId: raw.client_id ? String(raw.client_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.created ? new Date(raw.created) : undefined,
    lineItems: (raw.order_items ?? []).map(l => ({
      id: String(l.id),
      itemDescription: l.description || undefined,
      unitAmount: l.unit_price,
      unitQuantity: l.quantity,
      totalAmount: l.total,
      accountId: l.account_id ? String(l.account_id) : undefined,
    } satisfies Lineitem)),
    metadata: raw as Record<string, unknown>,
  }
}
