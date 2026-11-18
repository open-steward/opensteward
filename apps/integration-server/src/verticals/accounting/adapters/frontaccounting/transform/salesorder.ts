import type { SalesOrder } from '../../../schema/salesorder'
import type { Lineitem } from '../../../schema/shared'
import type { FAOrder, FAOrderLine } from './order'

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

export function transformSalesOrder(raw: FAOrder): SalesOrder {
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
