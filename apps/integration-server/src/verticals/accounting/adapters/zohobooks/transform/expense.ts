import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ZohoBooksExpenseLineItem {
  line_item_id: string
  account_id: string
  description: string
  quantity: number
  unit_price: number
  item_total: number
}

export interface ZohoBooksExpense {
  expense_id: string
  date: string
  account_id: string
  vendor_id: string
  currency_code: string
  total: number
  tax_total: number
  description: string
  status: string
  line_items?: ZohoBooksExpenseLineItem[]
  [key: string]: unknown
}

function mapLineItem(li: ZohoBooksExpenseLineItem): Lineitem {
  return {
    id: li.line_item_id || undefined,
    accountId: li.account_id || undefined,
    itemDescription: li.description || undefined,
    unitAmount: li.unit_price,
    unitQuantity: li.quantity,
    totalAmount: li.item_total,
  }
}

export function transformExpense(raw: ZohoBooksExpense): Expense {
  return {
    id: raw.expense_id,
    accountId: raw.account_id || undefined,
    contactId: raw.vendor_id || undefined,
    name: raw.description || undefined,
    currency: raw.currency_code || undefined,
    taxAmount: raw.tax_total || undefined,
    totalAmount: raw.total,
    lineItems: (raw.line_items ?? []).map(mapLineItem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
