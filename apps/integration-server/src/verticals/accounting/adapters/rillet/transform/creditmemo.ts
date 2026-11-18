import { parseDecimal, toCalendarDate } from '../../shared/transform'
import type {
  CreditMemo,
  CreditMemoApplication,
  CreditMemoStatus,
} from '../../../schema/creditmemo'
import type { Lineitem } from '../../../schema/shared'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'

// ── Rillet API types ───────────────────────────────────────────────────────────

export type { RilletMonetaryAmount }

export interface RilletCreditMemoItem {
  id: string
  description: string
  /**
   * A decimal string (`"1.0000"`) in v4.0, the version `X-Rillet-API-Version`
   * requests (constants.ts): `"type": "string", "format": "number"`
   * (https://docs.api.rillet.com/reference/list-all-credit-memos.md). v3.0 sent a number; a
   * number still parses, so a row cached before the move to v4 reads the same.
   */
  quantity: string | number
  net_amount: RilletMonetaryAmount
  total_amount: RilletMonetaryAmount
  taxed_amount?: RilletMonetaryAmount
  product_id: string
  [key: string]: unknown
}

/**
 * `CreditMemoApplication` in Rillet's OpenAPI components
 * (https://docs.api.rillet.com/reference/list-all-invoices-1.md): one
 * application of a credit memo to one invoice. `invoice_number` is the only
 * optional property.
 */
export interface RilletCreditMemoApplication {
  id: string
  credit_memo_id: string
  invoice_id: string
  invoice_number?: string
  amount: RilletMonetaryAmount
  application_date: string
  [key: string]: unknown
}

/**
 * `CreditMemo` in Rillet's OpenAPI components
 * (https://docs.api.rillet.com/reference/list-all-invoices-1.md). It has no
 * `due_date` and no `amount_due`: what is left to apply is
 * `remaining_amount`, what has been applied is `applied_amount`.
 *
 * All of this is the v4.0 shape, which is why the client sends
 * `X-Rillet-API-Version: 4` (constants.ts). The v3.0 `CreditMemo`
 * (https://docs.api.rillet.com/v3.0/reference/list-all-credit-memos.md) has
 * none of `applications`, `applied_amount` or `remaining_amount`: it has
 * `amount_due`, `due_date`, a single `invoice_id` and the status enum
 * UNPAID, REFUNDED, APPLIED, APPLIED_TO_BALANCE. Read under v3, `appliedTo`,
 * `paidAmount` and `balanceAmount` came back empty and every UNPAID memo
 * mapped to unknown.
 */
export interface RilletCreditMemo {
  id: string
  subsidiary_id: string
  credit_memo_number: string
  customer_id: string
  /** Rillet has no top-level invoice link; applications carry it, one per invoice. */
  applications?: RilletCreditMemoApplication[]
  items: RilletCreditMemoItem[]
  credit_memo_date: string
  /** Documented enum: UNAPPLIED, PARTIALLY_APPLIED, APPLIED, REFUNDED. */
  status: string
  net_amount: RilletMonetaryAmount
  total: RilletMonetaryAmount
  applied_amount: RilletMonetaryAmount
  remaining_amount: RilletMonetaryAmount
  taxed_amount: RilletMonetaryAmount
  updated_at: string
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

/**
 * The documented enum is UNAPPLIED, PARTIALLY_APPLIED, APPLIED and REFUNDED.
 * A credit memo is "paid" when its credit is used up, by application to
 * invoices or by refund, the convention the other adapters follow.
 */
function mapStatus(status: string): CreditMemoStatus {
  switch (status) {
    case 'UNAPPLIED':
      return 'AUTHORIZED'
    case 'PARTIALLY_APPLIED':
      return 'PARTIALLY_PAID'
    case 'APPLIED':
    case 'REFUNDED':
      return 'PAID'
    default:
      return 'unknown'
  }
}

// ── Line items ─────────────────────────────────────────────────────────────────

/** Canonical quantities are integers; Rillet's may be fractional. */
function toUnitQuantity(quantity: number | string | undefined): number | undefined {
  const n = parseDecimal(quantity)
  return n === undefined ? undefined : Math.round(n)
}

function mapLineItems(items: RilletCreditMemoItem[]): Lineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id || undefined,
    itemId: item.product_id || undefined,
    itemDescription: item.description || undefined,
    unitQuantity: toUnitQuantity(item.quantity),
    taxAmount: rilletAmountToMinor(item.taxed_amount),
    totalAmount: rilletAmountToMinor(item.total_amount),
  }))
}

// ── Applications ───────────────────────────────────────────────────────────────

function mapApplications(
  applications: RilletCreditMemoApplication[] | undefined,
): CreditMemoApplication[] | undefined {
  if (!applications) return undefined
  return applications
    .filter((a) => a.invoice_id || a.invoice_number)
    .map((a) => ({
      invoiceId: a.invoice_id || undefined,
      invoiceNumber: a.invoice_number || undefined,
      amount: rilletAmountToMinor(a.amount),
      appliedAt: toCalendarDate(a.application_date),
    }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformCreditMemo(raw: RilletCreditMemo): CreditMemo {
  const currency = raw.total?.currency || raw.net_amount?.currency || undefined

  return {
    id: raw.id,
    status: mapStatus(raw.status),
    creditmemoNumber: raw.credit_memo_number || undefined,
    contactId: raw.customer_id || undefined,
    currency,
    totalAmount: rilletAmountToMinor(raw.total),
    taxAmount: rilletAmountToMinor(raw.taxed_amount),
    paidAmount: rilletAmountToMinor(raw.applied_amount),
    balanceAmount: rilletAmountToMinor(raw.remaining_amount),
    lineItems: mapLineItems(raw.items ?? []),
    appliedTo: mapApplications(raw.applications),
    postedAt: raw.credit_memo_date ? new Date(raw.credit_memo_date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
