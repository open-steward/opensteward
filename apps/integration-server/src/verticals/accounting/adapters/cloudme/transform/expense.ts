import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface CloudMeExpenseLineItem {
  id: string | number
  description: string
  quantity: number
  unit_price: number
  total: number
  tax_amount: number
  account_id: string | number
  [key: string]: unknown
}

export interface CloudMeExpense {
  id: string | number
  date: string
  total: number
  tax: number
  currency: string
  account_id: string | number
  contact_id: string | number
  description: string
  line_items: CloudMeExpenseLineItem[]
  [key: string]: unknown
}

function mapLineitem(item: CloudMeExpenseLineItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_id ? String(item.account_id) : undefined,
    itemDescription: item.description || undefined,
    unitAmount: item.unit_price,
    unitQuantity: item.quantity,
    totalAmount: item.total,
    taxAmount: item.tax_amount || undefined,
  }
}

export function transformExpense(raw: CloudMeExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.account_id ? String(raw.account_id) : undefined,
    contactId: raw.contact_id ? String(raw.contact_id) : undefined,
    currency: raw.currency || undefined,
    totalAmount: raw.total,
    taxAmount: raw.tax || undefined,
    lineItems: (raw.line_items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
