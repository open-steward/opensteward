import type { Bill, BillStatus } from '../../../schema/bill'
import type { Lineitem } from '../../../schema/shared'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'

export type { RilletMonetaryAmount }

// ── Rillet API types ───────────────────────────────────────────────────────────
//
// `Bill`, `BillItem` and `BillStatus` in Rillet's OpenAPI components
// (https://docs.api.rillet.com/reference/list-all-bills-1.md). A bill has no
// header total, tax total or balance: amounts live on the items only.

/** `ExpenseTaxRate`: the tax on one bill or charge item. */
export interface RilletExpenseTaxRate {
  percentage: string
  tax_amount: RilletMonetaryAmount
  country: string
  type: string
  description: string
  tax_code?: string
  coverage: 'INCLUSIVE' | 'EXCLUSIVE'
  [key: string]: unknown
}

export interface RilletBillItem {
  id: string
  description?: string
  account_code: string
  amount: RilletMonetaryAmount
  tax_rate?: RilletExpenseTaxRate
  [key: string]: unknown
}

export interface RilletBill {
  id: string
  vendor_id: string
  expense_number: string
  items: RilletBillItem[]
  bill_date: string
  due_date: string
  impact_date?: string
  /** Documented enum: DRAFT, UNPAID, PAID, PARTIALLY_PAID, CREDITED, PARTIALLY_CREDITED, APPLIED. */
  status: string
  subsidiary_id?: string
  updated_at: string
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

/**
 * The documented `BillStatus` enum is DRAFT, UNPAID, PAID, PARTIALLY_PAID,
 * CREDITED, PARTIALLY_CREDITED and APPLIED.
 *
 * PARTIALLY_CREDITED is still owed, like UNPAID: a partial vendor credit
 * leaves part of the bill open, and VOIDED would say nothing is due. The
 * invoice transform maps its PARTIALLY_CREDITED the same way. Unlike an
 * invoice, a bill documents no `overdue` flag, so an open bill is AUTHORIZED.
 * CREDITED is fully credited and maps to VOIDED, as on an invoice.
 *
 * APPLIED has no documented meaning on a bill, and anything outside the enum
 * is unknown, so both become 'unknown' rather than a guess.
 */
function mapStatus(status: string): BillStatus {
  switch (status) {
    case 'DRAFT':
      return 'DRAFT'
    case 'UNPAID':
    case 'PARTIALLY_CREDITED':
      return 'AUTHORIZED'
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    case 'PAID':
      return 'PAID'
    case 'CREDITED':
      return 'VOIDED'
    default:
      return 'unknown'
  }
}

// ── Line items ─────────────────────────────────────────────────────────────────

function mapLineItems(items: RilletBillItem[]): Lineitem[] {
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

export function transformBill(raw: RilletBill): Bill {
  const firstItem = raw.items?.[0]
  const currency = firstItem?.amount?.currency || undefined

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    billNumber: raw.expense_number || undefined,
    contactId: raw.vendor_id || undefined,
    currency,
    lineItems: mapLineItems(raw.items ?? []),
    postedAt: raw.bill_date ? new Date(raw.bill_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
