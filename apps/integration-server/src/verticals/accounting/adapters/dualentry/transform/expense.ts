/**
 * DualEntry direct-expense → canonical Expense.
 *
 * DualEntry exposes direct expenses at GET /public/v2/direct-expenses/.
 * These are expenses that bypass the bill workflow (e.g. petty cash,
 * corporate card charges) and are posted immediately without approval.
 */
import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal, toMinorUnits } from '../../shared/transform'

export interface DualentryDirectExpenseItem {
  id: number
  position: number
  account_number: number | null
  expense_description: string | null
  rate: string
  quantity: string
  net_amount: string
  tax_amount: string
  gross_amount: string
  amount: string
  [key: string]: unknown
}

export interface DualentryDirectExpense {
  id: number
  internal_id: number
  number: number | null
  date: string | null
  transaction_date: string | null
  company_id: number | null
  company_name: string | null
  company_currency: string | null
  vendor_id: number | null
  vendor_name: string | null
  account_number: number | null
  currency_iso_4217_code: string | null
  exchange_rate: string | null
  amount: string
  bank_or_credit_card_amount: string | null
  memo: string | null
  check_number: string | null
  payment_method_id: number | null
  record_status: 'draft' | 'posted' | 'archived' | string
  items: DualentryDirectExpenseItem[]
  [key: string]: unknown
}

function mapLineitem(item: DualentryDirectExpenseItem): Lineitem {
  return {
    id: String(item.id),
    accountId: item.account_number != null ? String(item.account_number) : undefined,
    itemDescription: item.expense_description || undefined,
    unitAmount: toMinorUnits(item.rate),
    unitQuantity:
      parseDecimal(item.quantity) != null
        ? Math.round(parseDecimal(item.quantity)!)
        : undefined,
    totalAmount: toMinorUnits(item.gross_amount),
    taxAmount: toMinorUnits(item.tax_amount),
  }
}

export function transformExpense(raw: DualentryDirectExpense): Expense {
  return {
    id: String(raw.id),
    accountId: raw.account_number != null ? String(raw.account_number) : undefined,
    // vendor_id maps to contactId using the vend_ prefix consistent with contacts
    contactId: raw.vendor_id != null ? `vend_${raw.vendor_id}` : undefined,
    currency: raw.currency_iso_4217_code || undefined,
    totalAmount: toMinorUnits(raw.amount),
    lineItems: (raw.items ?? []).map(mapLineitem),
    postedAt: raw.date ? new Date(raw.date) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
