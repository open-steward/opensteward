import type { Expense } from '../../../schema/expense'
import type { Lineitem } from '../../../schema/shared'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'
import type { RilletExpenseTaxRate } from './bill'

// ── Rillet API types ───────────────────────────────────────────────────────────
//
// Rillet models employee and card charges under /charges.
// These are card or out-of-pocket employee charges awaiting policy review,
// subsidiary allocation, or conversion into reimbursable payables.
//
// `Charge`, `ChargeItem` and `ChargeStatus` in Rillet's OpenAPI components
// (https://docs.api.rillet.com/reference/list-all-charges.md). A charge has no
// header total, tax total, employee or creation time: amounts and tax live on
// the items only, and `credit_card_account_code` / `funding_account_code` are
// write-only.

export type { RilletMonetaryAmount }

export interface RilletChargeItem {
  id: string
  description?: string
  account_code: string
  amount: RilletMonetaryAmount
  tax_rate?: RilletExpenseTaxRate
  [key: string]: unknown
}

export interface RilletCharge {
  id: string
  vendor_id: string
  items: RilletChargeItem[]
  charge_date: string
  impact_date?: string
  subsidiary_id?: string
  /** Documented enum: UNPAID, PAID, PARTIALLY_PAID. The canonical Expense has no status. */
  status: string
  updated_at: string
  [key: string]: unknown
}

// ── Line items ─────────────────────────────────────────────────────────────────

function mapLineItems(items: RilletChargeItem[]): Lineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id || undefined,
    itemDescription: item.description || undefined,
    // `account_code` is the chart-of-accounts code, not `Account.id` (the
    // account uuid, which bills and charges do not carry), so it is the
    // canonical `accountCode`: `accountId` must resolve against /accounts.
    accountCode: item.account_code || undefined,
    taxAmount: rilletAmountToMinor(item.tax_rate?.tax_amount),
    totalAmount: rilletAmountToMinor(item.amount),
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformExpense(raw: RilletCharge): Expense {
  const items = raw.items ?? []
  const currency = items[0]?.amount?.currency || undefined

  return {
    id: raw.id,
    // charges are linked to a vendor (merchant)
    contactId: raw.vendor_id || undefined,
    currency,
    lineItems: items.length > 0 ? mapLineItems(items) : undefined,
    postedAt: raw.charge_date ? new Date(raw.charge_date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
