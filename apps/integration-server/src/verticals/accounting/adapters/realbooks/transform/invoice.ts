import { toDate } from '../../shared/transform'
/**
 * RealBooks → canonical Invoice transform.
 *
 * RealBooks represents sales invoices as Inventory Vouchers with
 * transactionType = "Sales" (or the equivalent voucher type name).
 * The API returns voucher records with the structure below.
 *
 * Date format: RealBooks returns and expects dates in DD-MM-YYYY format.
 * All monetary amounts from RealBooks are decimal major units (e.g. 1250.00 INR);
 * canonical amounts are INTEGER MINOR UNITS so we multiply by 100 and round.
 */

import type { Invoice, InvoiceStatus } from '../../../schema/invoice'
import type { Lineitem } from '../../../schema/shared'

// ── RealBooks wire types ──────────────────────────────────────────────────────

export interface RealBooksItemTax {
  taxLedgerName: string
  taxAmount: number
  rate: number
}

export interface RealBooksItemDetail {
  rowId?: number
  itemName?: string
  itemCode?: string
  itemDescription?: string
  itemGrossAmount?: number
  itemAmount?: number
  itemRate?: number
  quantity?: number
  discountAmount?: number
  unitName?: string
  ledgerName?: string
  ledgerCode?: string
  itemTax?: RealBooksItemTax[]
  [key: string]: unknown
}

export interface RealBooksLedgerDetail {
  ledger?: string | { id?: number; ledgerName?: string }
  amountType?: string  // "dr" | "cr"
  amount?: number
  [key: string]: unknown
}

export interface RealBooksInvoice {
  /** Voucher / transaction id */
  id?: number
  transactionNumber?: string
  transactionDate?: string
  transactionDescription?: string
  transactionType?: string
  /** Party ledger name — represents the customer */
  partyLedger?: { id?: number; ledgerName?: string; partyDetails?: Record<string, unknown> }
  currencySymbol?: string
  itemDetails?: RealBooksItemDetail[]
  accountsTransaction?: {
    id?: number
    transactionDate?: string
    transactionNumber?: string
    transactionType?: string
    transactionDescription?: string
    ledgerDetails?: RealBooksLedgerDetail[]
  }
  [key: string]: unknown
}

// ── Date / money helpers ──────────────────────────────────────────────────────

/**
 * Parse a RealBooks date string in DD-MM-YYYY format to a JS Date.
 * Returns undefined when the input is missing, not a string, or produces an
 * invalid date — never throws.
 */
export function parseDDMMYYYY(raw: unknown): Date | undefined {
  if (typeof raw !== 'string' || !raw) return undefined
  // Split on '-' or '/' to handle both DD-MM-YYYY and DD/MM/YYYY
  const parts = raw.split(/[-/]/)
  if (parts.length !== 3) return undefined
  const [dd, mm, yyyy] = parts
  if (!dd || !mm || !yyyy) return undefined
  // Reconstruct as YYYY-MM-DD so JS Date constructor parses unambiguously
  const iso = `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`
  const d = new Date(iso)
  return Number.isNaN(d.getTime()) ? undefined : d
}

/**
 * Format a JS Date as DD-MM-YYYY (the format RealBooks API expects in request
 * bodies). Returns empty string when input is nullish — never throws.
 */
export function toDDMMYYYY(date: Date | null | undefined): string {
  if (!date) return ''
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yyyy = date.getFullYear()
  return `${dd}-${mm}-${yyyy}`
}

/**
 * Convert a RealBooks decimal major-unit amount (e.g. 1250.50) to an integer
 * minor-unit amount (e.g. 125050). Returns undefined for null/undefined input.
 */
export function toMinorUnits(amount: number | null | undefined): number | undefined {
  if (amount == null || !Number.isFinite(amount)) return undefined
  return Math.round(amount * 100)
}

// ── Helper ────────────────────────────────────────────────────────────────────

function mapStatus(_raw: RealBooksInvoice): InvoiceStatus {
  // RealBooks does not expose a payment status field in the voucher payload.
  // Treat all created vouchers as AUTHORIZED (posted to the books).
  return 'AUTHORIZED'
}

function mapLineitem(row: RealBooksItemDetail): Lineitem {
  const rawTax = (row.itemTax ?? []).reduce((sum, t) => sum + (t.taxAmount ?? 0), 0)
  return {
    id: row.rowId !== undefined ? String(row.rowId) : undefined,
    itemId: row.itemCode || undefined,
    itemName: row.itemName || undefined,
    itemDescription: row.itemDescription || undefined,
    unitAmount: toMinorUnits(row.itemRate),
    unitQuantity: row.quantity != null ? Math.round(row.quantity) : undefined,
    discountAmount: toMinorUnits(row.discountAmount),
    taxAmount: rawTax ? toMinorUnits(rawTax) : undefined,
    totalAmount: toMinorUnits(row.itemAmount ?? row.itemGrossAmount),
  }
}

function partyLedgerName(raw: RealBooksInvoice): string | undefined {
  const pl = raw.partyLedger
  if (!pl) return undefined
  return pl.ledgerName || undefined
}

function totalAmount(raw: RealBooksInvoice): number | undefined {
  // Sum all debit legs of the accounts transaction ledger details
  const txn = raw.accountsTransaction
  if (!txn?.ledgerDetails?.length) return undefined
  const dr = txn.ledgerDetails
    .filter((ld) => (ld.amountType ?? '').toLowerCase() === 'dr')
    .reduce((sum, ld) => sum + (ld.amount ?? 0), 0)
  return dr ? toMinorUnits(dr) : undefined
}

// ── Transform ─────────────────────────────────────────────────────────────────

export function transformInvoice(raw: RealBooksInvoice): Invoice {
  const txn = raw.accountsTransaction ?? raw
  const id = raw.id ?? (txn as RealBooksInvoice).id
  const txnNumber = raw.transactionNumber ?? (txn as RealBooksInvoice).transactionNumber
  const txnDate = raw.transactionDate ?? (txn as RealBooksInvoice).transactionDate

  return {
    id: id !== undefined ? String(id) : txnNumber,
    type: 'INVOICE',
    status: mapStatus(raw),
    invoiceNumber: txnNumber || undefined,
    contactId: partyLedgerName(raw),
    currency: raw.currencySymbol || undefined,
    totalAmount: totalAmount(raw),
    notes: raw.transactionDescription || undefined,
    lineItems: (raw.itemDetails ?? []).map(mapLineitem),
    postedAt: parseDDMMYYYY(txnDate),
    metadata: raw as Record<string, unknown>,
  }
}

// ── Untransform (canonical → RealBooks create body json_obj) ─────────────────

export function untransformInvoice(invoice: Partial<Invoice>): Record<string, unknown> {
  return {
    id: 0,
    transactionDate: toDDMMYYYY(toDate(invoice.postedAt)),
    transactionNumber: invoice.invoiceNumber ?? '',
    transactionDescription: invoice.notes ?? '',
    transactionType: 'Sales',
    partyLedger: {
      id: 0,
      ledgerName: invoice.contactId ?? '',
    },
    currencySymbol: invoice.currency ?? '',
    itemDetails: (invoice.lineItems ?? []).map((li, idx) => ({
      rowId: idx + 1,
      itemName: li.itemName ?? li.itemDescription ?? '',
      itemCode: li.itemId ?? '',
      // Canonical amounts are integer minor units; RealBooks expects decimal major units
      itemRate: li.unitAmount != null ? li.unitAmount / 100 : 0,
      quantity: li.unitQuantity ?? 1,
      itemAmount: li.totalAmount != null ? li.totalAmount / 100 : 0,
      itemGrossAmount: li.totalAmount != null ? li.totalAmount / 100 : 0,
      discountAmount: li.discountAmount != null ? li.discountAmount / 100 : 0,
    })),
  }
}
