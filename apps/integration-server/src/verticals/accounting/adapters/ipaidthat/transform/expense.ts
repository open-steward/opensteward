import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface IpaidthatExpenseItem {
  id: number
  account_id: string
  name: string
  unit_price: number
  quantity: number
  tax_percent: number
  [key: string]: unknown
}

export interface IpaidthatExpense {
  id: string
  name: string
  supplier_id: string
  currency: string
  date: string
  items: IpaidthatExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(row: IpaidthatExpenseItem): Lineitem {
  const lineTotal = (row.unit_price ?? 0) * (row.quantity ?? 1)
  const taxAmount = lineTotal * ((row.tax_percent ?? 0) / 100)
  return {
    id: String(row.id),
    accountId: row.account_id || undefined,
    itemDescription: row.name || undefined,
    unitAmount: row.unit_price,
    unitQuantity: row.quantity,
    totalAmount: lineTotal,
    taxAmount,
  }
}

export function transformExpense(raw: IpaidthatExpense): Expense {
  const items = (raw.items ?? []).map(mapLineitem)
  const totalAmount = items.reduce((s, i) => s + (i.totalAmount ?? 0) + (i.taxAmount ?? 0), 0)
  const taxAmount = items.reduce((s, i) => s + (i.taxAmount ?? 0), 0)

  return {
    id: String(raw.id),
    name: raw.name || undefined,
    contactId: raw.supplier_id || undefined,
    currency: raw.currency || undefined,
    taxAmount: taxAmount || undefined,
    totalAmount,
    lineItems: items,
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
