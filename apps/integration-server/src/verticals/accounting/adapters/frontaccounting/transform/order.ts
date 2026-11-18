import type { Order } from '../../../schema/order'
import type { Lineitem } from '../../../schema/shared'

export interface FAOrderLine {
  id?: number | string
  stock_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FAOrder {
  id: number | string
  reference?: string
  ord_date?: string
  debtor_no?: number | string
  curr_code?: string
  total?: number
  tax_total?: number
  lines?: FAOrderLine[]
  [key: string]: unknown
}

function mapLineitem(line: FAOrderLine): Lineitem {
  return {
    itemId: line.stock_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformOrder(raw: FAOrder): Order {
  return {
    id: String(raw.id),
    contactId: raw.debtor_no !== undefined ? String(raw.debtor_no) : undefined,
    currency: raw.curr_code || undefined,
    totalAmount: raw.total ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.ord_date ? new Date(raw.ord_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
