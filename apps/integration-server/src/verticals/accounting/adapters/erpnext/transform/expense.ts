import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface ErpNextExpenseItem {
  name: string
  item_name: string
  qty: number
  rate: number
  amount: number
  item_tax_amount: number
  expense_account: string
  [key: string]: unknown
}

export interface ErpNextExpense {
  name: string
  posting_date: string
  due_date: string
  base_grand_total: number
  base_total_taxes_and_charges: number
  status: string
  currency: string
  employee: string
  remarks: string
  items: ErpNextExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: ErpNextExpenseItem): Lineitem {
  return {
    id: item.name || undefined,
    accountId: item.expense_account || undefined,
    itemDescription: item.item_name || undefined,
    unitAmount: item.rate,
    unitQuantity: item.qty,
    totalAmount: item.amount,
    taxAmount: item.item_tax_amount || undefined,
  }
}

export function transformExpense(raw: ErpNextExpense): Expense {
  return {
    id: raw.name,
    contactId: raw.employee || undefined,
    totalAmount: raw.base_grand_total,
    taxAmount: raw.base_total_taxes_and_charges || undefined,
    currency: raw.currency || undefined,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.posting_date ? new Date(raw.posting_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
