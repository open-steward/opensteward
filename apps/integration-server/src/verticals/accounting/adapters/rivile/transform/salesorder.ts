import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface RivileSalesOrderLine {
  id?: string | number
  description?: string
  unit_price?: number
  quantity?: number
  total?: number
  [key: string]: unknown
}

export interface RivileSalesOrder {
  id: string | number
  status?: string
  currency?: string
  total?: number
  date?: string
  lines?: RivileSalesOrderLine[]
  [key: string]: unknown
}

function mapStatus(status?: string): SalesOrderStatus {
  switch (status) {
    case 'active': return 'ACTIVE'
    case 'completed': return 'COMPLETED'
    case 'cancelled': return 'CANCELLED'
    default: return 'DRAFT'
  }
}

export function transformSalesOrder(raw: RivileSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapStatus(raw.status),
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    lineItems: (raw.lines ?? []).map((l) => ({
      id: l.id != null ? String(l.id) : undefined,
      itemDescription: l.description || undefined,
      unitAmount: l.unit_price,
      unitQuantity: l.quantity,
      totalAmount: l.total,
    })),
    metadata: raw as Record<string, unknown>,
  }
}
