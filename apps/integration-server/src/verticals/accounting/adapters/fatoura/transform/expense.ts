import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface FatouaExpenseItem {
  id?: string
  description?: string
  qty?: number
  unit_price?: number
  total?: number
  tax_amount?: number
  [key: string]: unknown
}

export interface FatouaExpense {
  id: string
  date?: string
  tax_amount?: number
  total_amount?: number
  supplier_id?: string
  currency?: string
  items?: FatouaExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: FatouaExpenseItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    itemDescription: item.description || undefined,
    unitQuantity: item.qty,
    unitAmount: item.unit_price,
    totalAmount: item.total,
    taxAmount: item.tax_amount,
  }
}

export function transformExpense(raw: FatouaExpense): Expense {
  return {
    id: String(raw.id),
    contactId: raw.supplier_id ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.tax_amount,
    totalAmount: raw.total_amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
