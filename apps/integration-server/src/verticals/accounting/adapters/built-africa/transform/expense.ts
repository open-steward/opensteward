import type { Expense } from '../../../schema/expense'
import { toMinorUnits } from '../../shared/transform'

// ── Built Accounting raw type ─────────────────────────────────────────────────
// Docs: GET /api/v3/expenses, POST /api/v3/expenses

export interface BuiltAfricaExpense {
  id: number
  ref?: string
  user_id?: number
  business_id?: number
  description?: string
  amount?: number
  payment_accountID?: number
  receiving_accountID?: number
  entry_date?: string    // YYYY-MM-DD
  base_currency?: string
  fx_currency?: string
  rate?: number
  fx_amount?: number
  serial_number?: string
  expense_account?: {
    id?: number
    account_name?: string
    [key: string]: unknown
  }
  payment_account?: {
    id?: number
    account_name?: string
    [key: string]: unknown
  }
  created_at?: string
  updated_at?: string
  deleted_at?: string | null
  [key: string]: unknown
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformExpense(raw: BuiltAfricaExpense): Expense {
  return {
    id: String(raw.id),
    name: raw.description || undefined,
    accountId: raw.expense_account?.id !== undefined ? String(raw.expense_account.id) : undefined,
    currency: raw.base_currency || raw.fx_currency || undefined,
    // Built returns decimal amounts; canonical is integer minor units
    totalAmount: toMinorUnits(raw.amount),
    postedAt: raw.entry_date ? new Date(raw.entry_date) : undefined,
    createdAt: raw.created_at ? new Date(raw.created_at) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
