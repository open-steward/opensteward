import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface InvoiceqExpenseLineItem {
  item_id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  vat_amount?: number
  [key: string]: unknown
}

export interface InvoiceqExpense {
  id: string
  date?: string
  vat_amount?: number
  total_amount?: number
  supplier_id?: string
  currency_code?: string
  line_items?: InvoiceqExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: InvoiceqExpenseLineItem): Lineitem {
  return {
    itemId: item.item_id ? String(item.item_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.vat_amount,
  }
}

export function transformExpense(raw: InvoiceqExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency_code || undefined,
    taxAmount: raw.vat_amount,
    totalAmount: raw.total_amount,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
