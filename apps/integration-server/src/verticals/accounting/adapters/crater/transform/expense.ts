/**
 * Crater expense transform.
 *
 * Crater exposes expenses via GET /api/v1/expenses and GET /api/v1/expenses/{id}.
 * Expenses track costs that are not supplier bills.
 */
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'

export interface CraterExpenseItem {
  id?: string
  expense_category_name?: string
  description?: string
  amount?: number
  [key: string]: unknown
}

export interface CraterExpense {
  id: string
  expense_date?: string      // ISO date string e.g. "2026-02-01"
  amount?: number            // in minor units
  notes?: string
  expense_category_id?: string
  customer_business_id?: string | null
  user_id?: string | null
  payment_method?: string
  currency?: { code?: string }
  items?: CraterExpenseItem[]
  created_at?: string
  updated_at?: string
  [key: string]: unknown
}

function mapLineitem(item: CraterExpenseItem): Lineitem {
  return {
    id: item.id ? String(item.id) : undefined,
    itemName: item.expense_category_name || undefined,
    itemDescription: item.description || undefined,
    totalAmount: item.amount,
  }
}

export function transformExpense(raw: CraterExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.expense_category_id ? String(raw.expense_category_id) : undefined,
    contactId: raw.customer_business_id ? String(raw.customer_business_id) : undefined,
    userId: raw.user_id ? String(raw.user_id) : undefined,
    currency: raw.currency?.code || undefined,
    paymentMethod: raw.payment_method || undefined,
    totalAmount: raw.amount,
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.expense_date ? new Date(raw.expense_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
