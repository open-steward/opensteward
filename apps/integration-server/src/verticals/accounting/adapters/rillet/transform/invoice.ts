import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'
import { parseDecimal } from '../../shared/transform'
import { rilletAmountToMinor, type RilletMonetaryAmount } from '../money'

// ── Rillet API types ───────────────────────────────────────────────────────────

export type { RilletMonetaryAmount }

export interface RilletInvoiceItem {
  id: string
  description: string
  /**
   * A decimal string (`"1.0000"`) in v4.0, the version `X-Rillet-API-Version`
   * requests (constants.ts): `"type": "string", "format": "number"`
   * (https://docs.api.rillet.com/reference/list-all-invoices-1.md). v3.0 sent a number; a
   * number still parses, so a row cached before the move to v4 reads the same.
   */
  quantity: string | number
  gross_rate: RilletMonetaryAmount
  total_amount: RilletMonetaryAmount
  total_discount: RilletMonetaryAmount
  taxed_amount: RilletMonetaryAmount
  product_id: string
  [key: string]: unknown
}

export interface RilletInvoice {
  id: string
  subsidiary_id: string
  invoice_number: string
  customer_id: string
  contract_id?: string
  items: RilletInvoiceItem[]
  due_date: string
  invoice_date: string
  status: string
  net_amount: RilletMonetaryAmount
  amount_due: RilletMonetaryAmount
  total: RilletMonetaryAmount
  subtotal: RilletMonetaryAmount
  total_discount: RilletMonetaryAmount
  taxed_amount: RilletMonetaryAmount
  payment_terms: number
  purchase_order_number?: string
  memo?: string
  overdue: boolean
  sent_at?: string
  updated_at: string
  [key: string]: unknown
}

// ── Status mapping ─────────────────────────────────────────────────────────────

function mapStatus(raw: RilletInvoice): InvoiceStatus {
  switch (raw.status) {
    case 'PAID':
      return 'PAID'
    case 'PARTIALLY_PAID':
      return 'PARTIALLY_PAID'
    // A partial credit memo application leaves `amount_due` open, so the
    // invoice is still owed exactly like an unpaid one; VOIDED would tell
    // consumers nothing is due (https://docs.api.rillet.com/reference/list-all-invoices-1.md:
    // InvoiceStatus, `amount_due`, `overdue`).
    case 'UNPAID':
    case 'PARTIALLY_CREDITED':
      return raw.overdue ? 'OVERDUE' : 'AUTHORIZED'
    case 'UNBILLED':
      return 'DRAFT'
    case 'CREDITED':
      return 'VOIDED'
    default:
      // Outside the documented enum: say so rather than guess it is owed.
      return 'unknown'
  }
}

// ── Line items ─────────────────────────────────────────────────────────────────

/** Canonical quantities are integers; Rillet's may be fractional. */
function toUnitQuantity(quantity: number | string | undefined): number | undefined {
  const n = parseDecimal(quantity)
  return n === undefined ? undefined : Math.round(n)
}

function mapLineItems(items: RilletInvoiceItem[]): Lineitem[] {
  return (items ?? []).map((item) => ({
    id: item.id || undefined,
    itemId: item.product_id || undefined,
    itemDescription: item.description || undefined,
    unitAmount: rilletAmountToMinor(item.gross_rate),
    unitQuantity: toUnitQuantity(item.quantity),
    taxAmount: rilletAmountToMinor(item.taxed_amount),
    totalAmount: rilletAmountToMinor(item.total_amount),
    discountAmount: rilletAmountToMinor(item.total_discount),
  }))
}

// ── Transform ──────────────────────────────────────────────────────────────────

export function transformInvoice(raw: RilletInvoice): Invoice {
  const currency = raw.total?.currency || raw.net_amount?.currency || undefined

  return {
    id: raw.id,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: raw.invoice_number || undefined,
    contactId: raw.customer_id || undefined,
    currency,
    totalAmount: rilletAmountToMinor(raw.total),
    taxAmount: rilletAmountToMinor(raw.taxed_amount),
    discountAmount: rilletAmountToMinor(raw.total_discount),
    balanceAmount: rilletAmountToMinor(raw.amount_due),
    reference: raw.purchase_order_number || undefined,
    notes: raw.memo || undefined,
    lineItems: mapLineItems(raw.items ?? []),
    postedAt: raw.invoice_date ? new Date(raw.invoice_date) : undefined,
    dueAt: raw.due_date ? new Date(raw.due_date) : undefined,
    updatedAt: raw.updated_at ? new Date(raw.updated_at) : undefined,
    metadata: raw as Record<string, unknown>,
  }
}
