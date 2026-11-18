import type { SalesOrder, SalesOrderStatus } from '../../../schema/salesorder'

export interface MekariJurnalSalesOrderLine {
  id: number
  product_name: string
  quantity: number
  unit_price: number
  amount: number
  [key: string]: unknown
}

export interface MekariJurnalSalesOrder {
  id: number
  date: string
  status: string
  person_id: number | string | null
  total: number
  currency_code: string | null
  lines: MekariJurnalSalesOrderLine[]
  [key: string]: unknown
}

function mapSalesOrderStatus(status: string): SalesOrderStatus {
  switch (status) {
    case 'open':
      return 'ACTIVE'
    case 'paid':
    case 'closed':
      return 'COMPLETED'
    case 'voided':
    case 'cancelled':
      return 'CANCELLED'
    default:
      return 'DRAFT'
  }
}

export function transformSalesOrder(raw: MekariJurnalSalesOrder): SalesOrder {
  return {
    id: String(raw.id),
    status: mapSalesOrderStatus(raw.status),
    contactId: raw.person_id != null ? String(raw.person_id) : undefined,
    currency: raw.currency_code || undefined,
    totalAmount: raw.total,
    lineItems: (raw.lines ?? []).map((line) => ({
      id: String(line.id),
      itemDescription: line.product_name || undefined,
      unitAmount: line.unit_price,
      unitQuantity: line.quantity,
      totalAmount: line.amount,
    })),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
