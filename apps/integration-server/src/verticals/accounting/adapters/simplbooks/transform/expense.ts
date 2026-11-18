import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

// SimplBooks expense line row
export interface SimplbooksExpenseRow {
  id: number
  account_code?: string | null
  description?: string | null
  quantity?: number | null
  unit_price?: number | null
  total: number
  vat_amount?: number | null
  [key: string]: unknown
}

// SimplBooks purchase expense record
export interface SimplbooksExpense {
  id: number
  supplier_id?: number | null
  account_code?: string | null
  currency?: string | null
  total_vat?: number | null
  total?: number | null
  expense_date?: string | null  // YYYY-MM-DD
  description?: string | null
  rows?: SimplbooksExpenseRow[]
  [key: string]: unknown
}

function mapRow(row: SimplbooksExpenseRow): Lineitem {
  return {
    id: String(row.id),
    accountId: row.account_code || undefined,
    itemDescription: row.description || undefined,
    unitAmount: row.unit_price ?? undefined,
    unitQuantity: row.quantity != null ? Math.round(row.quantity) : undefined,
    totalAmount: row.total,
    taxAmount: row.vat_amount ?? undefined,
  }
}

export function transformExpense(raw: SimplbooksExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    accountId: raw.account_code || undefined,
    contactId: raw.supplier_id != null ? String(raw.supplier_id) : undefined,
    currency: raw.currency || undefined,
    taxAmount: raw.total_vat ?? undefined,
    totalAmount: raw.total ?? undefined,
    lineItems: (raw.rows ?? []).map(mapRow),
    postedAt: raw.expense_date ? new Date(raw.expense_date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
