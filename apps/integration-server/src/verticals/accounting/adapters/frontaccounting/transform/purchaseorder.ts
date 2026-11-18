import type { PurchaseOrder } from '../../../schema/purchaseorder'
import type { Lineitem } from '../../../schema/shared'

export interface FAPOLine {
  id?: number | string
  stock_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  amount?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FAPurchaseOrder {
  id: number | string
  reference?: string
  ord_date?: string
  supplier_id?: number | string
  curr_code?: string
  total?: number
  tax_total?: number
  lines?: FAPOLine[]
  [key: string]: unknown
}

function mapLineitem(line: FAPOLine): Lineitem {
  return {
    itemId: line.stock_id || undefined,
    itemDescription: line.description || undefined,
    unitAmount: line.unit_price,
    unitQuantity: line.quantity,
    totalAmount: line.amount ?? 0,
    taxAmount: line.tax_amount || undefined,
  }
}

export function transformPurchaseOrder(raw: FAPurchaseOrder): PurchaseOrder {
  return {
    id: String(raw.id),
    contactId: raw.supplier_id !== undefined ? String(raw.supplier_id) : undefined,
    currency: raw.curr_code || undefined,
    totalAmount: raw.total ?? 0,
    lineItems: (raw.lines ?? []).map(mapLineitem),
    postedAt: raw.ord_date ? new Date(raw.ord_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
