import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface WafeqExpenseLineItem {
  id?: string
  description?: string
  quantity?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  account_id?: string
  [key: string]: unknown
}

export interface WafeqExpense {
  id: string
  number?: string
  date?: string
  due_date?: string
  subtotal?: number
  tax_amount?: number
  total?: number
  amount_due?: number
  status?: string
  contact_id?: string
  currency?: string
  line_items?: WafeqExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: WafeqExpenseLineItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.quantity,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformExpense(raw: WafeqExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
